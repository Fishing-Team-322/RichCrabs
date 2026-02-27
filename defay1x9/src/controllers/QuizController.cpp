#include "controllers/QuizController.hpp"

#include <drogon/drogon.h>

#include <optional>
#include <string>
#include <vector>

#include "controllers/ControllerUtils.hpp"
#include "http_api_utils.hpp"

namespace {

bool isRpcDegradedStatus(QuizCoreRpcStatus status) {
  return status == QuizCoreRpcStatus::kUnavailable || status == QuizCoreRpcStatus::kUnknown ||
         status == QuizCoreRpcStatus::kDeadlineExceeded;
}

drogon::HttpResponsePtr degradedQuizResponse(const std::string& operation,
                                             const std::string& message = "quiz rpc unavailable") {
  Json::Value out;
  out["status"] = "degraded";
  out["code"] = "not_implemented_in_rust";
  out["operation"] = operation;
  out["message"] = message;
  return drogon::HttpResponse::newHttpJsonResponse(out);
}

Json::Value questionToJson(const QuizCoreQuizQuestion& q) {
  Json::Value out;
  out["id"] = q.id;
  out["text"] = q.text;
  for (const auto& option : q.options) out["options"].append(option);
  if (q.correct_option_index.has_value()) out["correctIndex"] = static_cast<Json::UInt>(*q.correct_option_index);
  return out;
}

Json::Value quizToJson(const QuizCoreQuiz& quiz) {
  Json::Value out;
  out["quizId"] = quiz.quiz_id;
  out["ownerUserId"] = quiz.owner_user_id;
  out["title"] = quiz.title;
  out["description"] = quiz.description;
  for (const auto& q : quiz.questions) out["questions"].append(questionToJson(q));
  return out;
}

std::optional<std::vector<QuizCoreQuizQuestion>> parseQuestions(const Json::Value& body,
                                                                api::JsonValidator& validator,
                                                                bool required) {
  if (!body.isMember("questions")) {
    if (required) validator.addIssue("questions", "required");
    return required ? std::nullopt : std::optional<std::vector<QuizCoreQuizQuestion>>{};
  }

  const auto& arr = body["questions"];
  if (!arr.isArray() || arr.empty()) {
    validator.addIssue("questions", "must_be_non_empty_array");
    return std::nullopt;
  }

  std::vector<QuizCoreQuizQuestion> out;
  for (Json::ArrayIndex i = 0; i < arr.size(); ++i) {
    const auto& row = arr[i];
    if (!row.isObject()) {
      validator.addIssue("questions", "type_mismatch");
      return std::nullopt;
    }

    QuizCoreQuizQuestion q;
    if (row.isMember("id")) {
      if (!row["id"].isString() || row["id"].asString().empty()) {
        validator.addIssue("questions[" + std::to_string(i) + "].id", "type_mismatch");
        return std::nullopt;
      }
      q.id = row["id"].asString();
    }

    if (!row.isMember("text") || !row["text"].isString() || row["text"].asString().empty()) {
      validator.addIssue("questions[" + std::to_string(i) + "].text", "required");
      return std::nullopt;
    }
    q.text = row["text"].asString();

    if (!row.isMember("options") || !row["options"].isArray() || row["options"].size() < 2) {
      validator.addIssue("questions[" + std::to_string(i) + "].options", "must_have_at_least_2");
      return std::nullopt;
    }
    for (const auto& opt : row["options"]) {
      if (!opt.isString() || opt.asString().empty()) {
        validator.addIssue("questions[" + std::to_string(i) + "].options", "type_mismatch");
        return std::nullopt;
      }
      q.options.push_back(opt.asString());
    }

    if (row.isMember("correctIndex")) {
      if (!row["correctIndex"].isUInt()) {
        validator.addIssue("questions[" + std::to_string(i) + "].correctIndex", "type_mismatch");
        return std::nullopt;
      }
      auto correctIndex = row["correctIndex"].asUInt();
      if (correctIndex >= q.options.size()) {
        validator.addIssue("questions[" + std::to_string(i) + "].correctIndex", "out_of_range");
        return std::nullopt;
      }
      q.correct_option_index = static_cast<uint32_t>(correctIndex);
    }

    out.push_back(std::move(q));
  }

  return out;
}

}  // namespace

namespace controllers {

void RegisterQuizRoutes(const Config& conf, QuizCoreClient& quizCore, EntitlementsClient& entitlementsClient) {
  drogon::app().registerHandler(
      "/api/v1/quizzes",
      [&quizCore, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        if (!RequireCsrf(req, conf, cb)) return;

        std::string parseError;
        auto body = api::parseJsonBody(req, parseError);
        if (!body) {
          cb(api::jsonErrorResponse(400, api::ErrorCode::kInvalidJson, parseError));
          return;
        }

        api::JsonValidator validator(*body);
        auto title = validator.requiredString("title");
        auto owner = validator.optionalUuid("ownerUserId");
        auto description = validator.optionalString("description");
        auto questions = parseQuestions(*body, validator, true);
        if (!validator.ok() || !title || !questions) {
          cb(api::validationErrorResponse(validator.issues()));
          return;
        }

        const auto ownerUserId = owner.value_or(resolveUserId(req, conf));
        const auto rpc = quizCore.createQuiz(ownerUserId, *title, description.value_or(""), *questions);
        if (isRpcDegradedStatus(rpc.status)) {
          cb(degradedQuizResponse("createQuiz", rpc.error_message));
          return;
        }
        if (rpc.status != QuizCoreRpcStatus::kOk || !rpc.quiz.has_value()) {
          cb(api::jsonErrorResponse(api::mapRpcError(rpc.status, "QuizService.CreateQuiz", rpc.error_code, rpc.error_message)));
          return;
        }

        Json::Value responseBody;
        responseBody["quiz"] = quizToJson(*rpc.quiz);
        responseBody["status"] = "created";
        cb(drogon::HttpResponse::newHttpJsonResponse(responseBody));
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/api/v1/quizzes",
      [&quizCore](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        const uint32_t limit = req->getOptionalParameter<uint32_t>("limit").value_or(20);
        std::string pageToken = req->getParameter("pageToken");
        if (pageToken.empty()) pageToken = req->getParameter("offset");

        std::optional<std::string> owner;
        const auto ownerRaw = req->getParameter("ownerUserId");
        if (!ownerRaw.empty()) owner = ownerRaw;

        const auto rpc = quizCore.listQuizzes(owner, limit, pageToken);
        if (isRpcDegradedStatus(rpc.status)) {
          cb(degradedQuizResponse("listQuizzes", rpc.error_message));
          return;
        }
        if (rpc.status != QuizCoreRpcStatus::kOk) {
          cb(api::jsonErrorResponse(api::mapRpcError(rpc.status, "QuizService.ListQuizzes", rpc.error_code, rpc.error_message)));
          return;
        }

        Json::Value out;
        out["limit"] = limit;
        out["nextPageToken"] = rpc.next_page_token;
        for (const auto& row : rpc.quizzes) out["items"].append(quizToJson(row));
        cb(drogon::HttpResponse::newHttpJsonResponse(out));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/api/v1/quizzes/{1}",
      [&quizCore](const drogon::HttpRequestPtr&, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string quizId) {
        const auto rpc = quizCore.getQuiz(quizId);
        if (isRpcDegradedStatus(rpc.status)) {
          cb(degradedQuizResponse("getQuiz", rpc.error_message));
          return;
        }
        if (rpc.status != QuizCoreRpcStatus::kOk || !rpc.quiz.has_value()) {
          cb(api::jsonErrorResponse(api::mapRpcError(rpc.status, "QuizService.GetQuiz", rpc.error_code, rpc.error_message)));
          return;
        }

        Json::Value out;
        out["quiz"] = quizToJson(*rpc.quiz);
        cb(drogon::HttpResponse::newHttpJsonResponse(out));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/api/v1/quizzes/{1}",
      [&quizCore, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string quizId) {
        if (!RequireCsrf(req, conf, cb)) return;

        std::string parseError;
        auto body = api::parseJsonBody(req, parseError);
        if (!body) {
          cb(api::jsonErrorResponse(400, api::ErrorCode::kInvalidJson, parseError));
          return;
        }

        api::JsonValidator validator(*body);
        auto title = validator.optionalString("title");
        auto description = validator.optionalString("description");
        std::optional<std::vector<QuizCoreQuizQuestion>> questions;
        if (body->isMember("questions")) {
          questions = parseQuestions(*body, validator, false);
          if (!questions) {
            cb(api::validationErrorResponse(validator.issues()));
            return;
          }
        }
        if (!body->isMember("title") && !body->isMember("description") && !body->isMember("questions")) {
          validator.addIssue("title", "at_least_one_of_title_description_questions_required");
        }
        if (!validator.ok()) {
          cb(api::validationErrorResponse(validator.issues()));
          return;
        }

        auto current = quizCore.getQuiz(quizId);
        if (isRpcDegradedStatus(current.status)) {
          cb(degradedQuizResponse("getQuizForUpdate", current.error_message));
          return;
        }
        if (current.status != QuizCoreRpcStatus::kOk || !current.quiz.has_value()) {
          cb(api::jsonErrorResponse(api::mapRpcError(current.status, "QuizService.GetQuiz", current.error_code, current.error_message)));
          return;
        }

        QuizCoreQuiz update = *current.quiz;
        if (title.has_value()) update.title = *title;
        if (description.has_value()) update.description = *description;
        if (questions.has_value()) update.questions = *questions;

        const auto rpc = quizCore.updateQuiz(update);
        if (isRpcDegradedStatus(rpc.status)) {
          cb(degradedQuizResponse("updateQuiz", rpc.error_message));
          return;
        }
        if (rpc.status != QuizCoreRpcStatus::kOk || !rpc.quiz.has_value()) {
          cb(api::jsonErrorResponse(api::mapRpcError(rpc.status, "QuizService.UpdateQuiz", rpc.error_code, rpc.error_message)));
          return;
        }

        Json::Value out;
        out["quiz"] = quizToJson(*rpc.quiz);
        out["status"] = "updated";
        cb(drogon::HttpResponse::newHttpJsonResponse(out));
      },
      {drogon::Patch});

  drogon::app().registerHandler(
      "/api/v1/quizzes/{1}/publish",
      [&quizCore, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string quizId) {
        if (!RequireCsrf(req, conf, cb)) return;

        const auto userId = resolveUserId(req, conf);
        const auto rpc = quizCore.publishQuiz(quizId, userId);
        if (isRpcDegradedStatus(rpc.status)) {
          cb(degradedQuizResponse("publishQuiz", rpc.error_message));
          return;
        }
        if (rpc.status != QuizCoreRpcStatus::kOk) {
          cb(api::jsonErrorResponse(api::mapRpcError(rpc.status, "QuizService.PublishQuiz", rpc.error_code, rpc.error_message)));
          return;
        }

        Json::Value out;
        if (rpc.quiz.has_value()) out["quiz"] = quizToJson(*rpc.quiz);
        out["publishedVersion"] = rpc.published_version;
        out["status"] = "published";
        cb(drogon::HttpResponse::newHttpJsonResponse(out));
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/api/v1/quizzes/ai-generate",
      [&quizCore, &entitlementsClient, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        if (!RequireCsrf(req, conf, cb)) return;

        std::string parseError;
        auto body = api::parseJsonBody(req, parseError);
        if (!body) {
          cb(api::jsonErrorResponse(400, api::ErrorCode::kInvalidJson, parseError));
          return;
        }

        api::JsonValidator validator(*body);
        auto prompt = validator.requiredString("prompt");
        std::optional<uint32_t> desiredQuestionCount;
        if (body->isMember("desiredQuestionCount")) {
          if (!(*body)["desiredQuestionCount"].isUInt() || (*body)["desiredQuestionCount"].asUInt() == 0) {
            validator.addIssue("desiredQuestionCount", "must_be_positive_integer");
          } else {
            desiredQuestionCount = (*body)["desiredQuestionCount"].asUInt();
          }
        }
        if (!validator.ok()) {
          cb(api::validationErrorResponse(validator.issues()));
          return;
        }

        const auto userId = resolveUserId(req, conf);
        const auto entitlement = entitlementsClient.checkAndConsume(userId, "AI_GENERATE");
        if (!entitlement.allowed) {
          Json::Value details;
          details["error"] = "limit_exceeded";
          if (entitlement.error->limit.has_value()) details["limit"] = *entitlement.error->limit;
          if (entitlement.error->retry_at.has_value()) details["retryAt"] = *entitlement.error->retry_at;
          cb(api::jsonErrorResponse(429,
                                    api::ErrorCode::kTooManyAttempts,
                                    entitlement.error->gateway_error.message,
                                    details));
          return;
        }
        const auto rpc = quizCore.startAiQuizJob(userId, *prompt, desiredQuestionCount);
        if (isRpcDegradedStatus(rpc.status)) {
          cb(degradedQuizResponse("startAiQuizJob", rpc.error_message));
          return;
        }
        if (rpc.status != QuizCoreRpcStatus::kOk) {
          cb(api::jsonErrorResponse(api::mapRpcError(rpc.status, "QuizService.StartAiQuizJob", rpc.error_code, rpc.error_message)));
          return;
        }

        Json::Value out;
        out["jobId"] = rpc.job_id;
        out["status"] = rpc.status_text;
        cb(drogon::HttpResponse::newHttpJsonResponse(out));
      },
      {drogon::Post});
}

}  // namespace controllers
