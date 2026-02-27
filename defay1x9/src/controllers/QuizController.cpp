#include "controllers/QuizController.hpp"

#include <drogon/drogon.h>

#include <json/reader.h>
#include <json/writer.h>

#include <algorithm>
#include <cctype>
#include <optional>
#include <string>
#include <vector>

#include "controllers/ControllerUtils.hpp"
#include "http_api_utils.hpp"
#include "redis_utils.hpp"

namespace {

constexpr uint64_t kRateLimitAiPerIp = 20;
constexpr uint64_t kRateLimitAiPerUser = 12;
constexpr uint64_t kRateLimitWindowSec = 60;

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

<<<<<<< HEAD
=======
struct PgConn final {
  std::string host;
  std::string db;
  std::string user;
  std::string password;
  unsigned short port = 5432;
};

struct StoredAiJob final {
  std::string job_id;
  std::string owner_user_id;
  std::string status;
  std::optional<QuizCoreQuiz> quiz;
  std::optional<std::string> error_code;
  std::optional<std::string> error_message;
};

std::optional<PgConn> parsePg(const std::string& url) {
  static const std::regex kUri(R"(^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:\/]+)(?::(\d+))?\/(.+)$)");
  std::smatch m;
  if (!std::regex_match(url, m, kUri)) return std::nullopt;
  PgConn c;
  c.user = m[1].str();
  c.password = m[2].str();
  c.host = m[3].str();
  if (m[4].matched) c.port = static_cast<unsigned short>(std::stoi(m[4].str()));
  c.db = m[5].str();
  return c;
}

std::mutex g_aiJobDbMu;
drogon::orm::DbClientPtr g_aiJobDb;

std::optional<drogon::orm::DbClientPtr> aiJobDb(const Config& conf) {
  std::lock_guard lk(g_aiJobDbMu);
  if (g_aiJobDb) return g_aiJobDb;
  const auto parsed = parsePg(conf.database_url);
  if (!parsed) return std::nullopt;
  const auto connInfo = "host=" + parsed->host + " port=" + std::to_string(parsed->port) + " dbname=" + parsed->db +
                        " user=" + parsed->user + " password=" + parsed->password + " application_name=quiz-ai-jobs-db";
  g_aiJobDb = drogon::orm::DbClient::newPgClient(connInfo, 1, false);
  return g_aiJobDb;
}

bool ensureAiJobSchema(const Config& conf, std::string& error) {
  const auto db = aiJobDb(conf);
  if (!db) {
    error = "cannot parse DATABASE_URL for ai jobs storage";
    return false;
  }
  try {
    (*db)->execSqlSync(
        "CREATE TABLE IF NOT EXISTS gateway_ai_quiz_jobs ("
        "job_id TEXT PRIMARY KEY,"
        "owner_user_id TEXT NOT NULL,"
        "status TEXT NOT NULL,"
        "quiz JSONB,"
        "error_code TEXT,"
        "error_message TEXT,"
        "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),"
        "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
        ");");
    return true;
  } catch (const std::exception& ex) {
    error = ex.what();
    return false;
  }
}

>>>>>>> origin/main
std::string normalizeAiJobStatus(const std::string& raw) {
  std::string normalized;
  normalized.reserve(raw.size());
  for (char ch : raw) normalized.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(ch))));
  if (normalized.empty()) return "queued";
  return normalized;
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

        std::string resolvedUserId;
        if (!RequireUserId(req, conf, cb, resolvedUserId)) return;
        const auto ownerUserId = owner.value_or(resolvedUserId);
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

        std::string userId;
        if (!RequireUserId(req, conf, cb, userId)) return;
        (void)userId;

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

        std::string userId;
        if (!RequireUserId(req, conf, cb, userId)) return;
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

        std::string userId;
        if (!RequireUserId(req, conf, cb, userId)) return;
        const auto ip = clientIpFromRequest(req);
        const auto ipDecision = RedisAllowFixedWindow(conf.redis_url, "rl:ai_generate:ip:" + ip, kRateLimitAiPerIp, kRateLimitWindowSec);
        if (ipDecision.has_value() && !ipDecision->allowed) {
          cb(api::jsonErrorResponse(429, api::ErrorCode::kTooManyAttempts, "rate limit exceeded"));
          return;
        }
        const auto userDecision = RedisAllowFixedWindow(conf.redis_url, "rl:ai_generate:user:" + userId, kRateLimitAiPerUser, kRateLimitWindowSec);
        if (userDecision.has_value() && !userDecision->allowed) {
          cb(api::jsonErrorResponse(429, api::ErrorCode::kTooManyAttempts, "rate limit exceeded"));
          return;
        }

        const auto entitlement = entitlementsClient.checkAndConsume(userId, "AI_GENERATE");
        if (!entitlement.allowed) {
          Json::Value details;
          details["error"] = "limit_exceeded";
          if (entitlement.error.has_value() && entitlement.error->limit.has_value()) details["limit"] = *entitlement.error->limit;
          if (entitlement.error.has_value() && entitlement.error->retry_at.has_value()) details["retryAt"] = *entitlement.error->retry_at;
          const auto message = entitlement.error.has_value() ? entitlement.error->gateway_error.message : "ai limit exceeded";
          cb(api::jsonErrorResponse(429, api::ErrorCode::kTooManyAttempts, message, details));
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
        out["status"] = normalizeAiJobStatus(rpc.status_text);
        cb(drogon::HttpResponse::newHttpJsonResponse(out));
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/api/v1/quizzes/ai-jobs/{1}",
      [&quizCore, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string jobId) {
        if (!RequireCsrf(req, conf, cb)) return;

        const auto rpc = quizCore.getAiQuizJob(jobId);
        if (rpc.status != QuizCoreRpcStatus::kOk) {
          cb(api::jsonErrorResponse(api::mapRpcError(rpc.status, "QuizService.GetAiQuizJob", rpc.error_code, rpc.error_message)));
          return;
        }

        Json::Value out;
        out["jobId"] = jobId;
        out["status"] = normalizeAiJobStatus(rpc.status_text);
        if (rpc.quiz.has_value()) out["quiz"] = quizToJson(*rpc.quiz);
        if (!rpc.error_code.empty()) out["errorCode"] = rpc.error_code;
        if (!rpc.error_message.empty()) out["errorMessage"] = rpc.error_message;
        cb(drogon::HttpResponse::newHttpJsonResponse(out));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/api/v1/quizzes/ai-jobs/{1}/result",
      [&quizCore, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string jobId) {
        if (!RequireCsrf(req, conf, cb)) return;

        const auto rpc = quizCore.getAiQuizJob(jobId);
        if (rpc.status != QuizCoreRpcStatus::kOk) {
          cb(api::jsonErrorResponse(api::mapRpcError(rpc.status, "QuizService.GetAiQuizJob", rpc.error_code, rpc.error_message)));
          return;
        }

        const std::string status = normalizeAiJobStatus(rpc.status_text);
        const std::optional<QuizCoreQuiz> quiz = rpc.quiz;

        if (status != "done") {
          Json::Value details;
          details["error"] = "job_not_done";
          details["status"] = status;
          cb(api::jsonErrorResponse(409, api::ErrorCode::kNotImplemented, "ai job is not done", details));
          return;
        }
        if (!quiz.has_value()) {
          cb(api::jsonErrorResponse(503, api::ErrorCode::kGrpcUnavailable, "ai job result is unavailable"));
          return;
        }

        Json::Value out;
        out["jobId"] = jobId;
        out["status"] = "done";
        out["quiz"] = quizToJson(*quiz);
        cb(drogon::HttpResponse::newHttpJsonResponse(out));
      },
      {drogon::Get});
}

}  // namespace controllers
