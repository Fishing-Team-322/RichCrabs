#include "controllers/QuizController.hpp"

#include <drogon/drogon.h>

#include <mutex>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include "controllers/ControllerUtils.hpp"
#include "http_api_utils.hpp"
#include "random.hpp"

namespace {

struct QuizQuestionDraft final {
  std::string id;
  std::string text;
  std::vector<std::string> options;
  int correct_index = -1;
  std::optional<int> time_limit_sec;
};

struct QuizDraft final {
  std::string quiz_id;
  std::string owner_user_id;
  std::string title;
  std::string description;
  bool published = false;
  std::vector<QuizQuestionDraft> questions;
};

class QuizStore final {
public:
  QuizDraft upsert(const QuizDraft& draft) {
    std::lock_guard<std::mutex> lock(mu_);
    data_[draft.quiz_id] = draft;
    return draft;
  }

  std::optional<QuizDraft> get(const std::string& quiz_id) const {
    std::lock_guard<std::mutex> lock(mu_);
    auto it = data_.find(quiz_id);
    if (it == data_.end()) return std::nullopt;
    return it->second;
  }

  std::vector<QuizDraft> list(const std::optional<std::string>& owner,
                              const std::optional<bool>& published,
                              int limit,
                              int offset) const {
    std::vector<QuizDraft> all;
    {
      std::lock_guard<std::mutex> lock(mu_);
      for (const auto& [_, quiz] : data_) {
        if (owner && quiz.owner_user_id != *owner) continue;
        if (published && quiz.published != *published) continue;
        all.push_back(quiz);
      }
    }

    if (offset < 0) offset = 0;
    if (limit <= 0) limit = 20;
    if (limit > 100) limit = 100;

    std::vector<QuizDraft> out;
    for (size_t i = static_cast<size_t>(offset); i < all.size() && static_cast<int>(out.size()) < limit; ++i) {
      out.push_back(all[i]);
    }
    return out;
  }

  std::optional<QuizDraft> patch(const std::string& quiz_id,
                                 const std::optional<std::string>& title,
                                 const std::optional<std::string>& description,
                                 const std::optional<std::vector<QuizQuestionDraft>>& questions) {
    std::lock_guard<std::mutex> lock(mu_);
    auto it = data_.find(quiz_id);
    if (it == data_.end()) return std::nullopt;

    if (title) it->second.title = *title;
    if (description) it->second.description = *description;
    if (questions) it->second.questions = *questions;
    return it->second;
  }

  std::optional<QuizDraft> publish(const std::string& quiz_id) {
    std::lock_guard<std::mutex> lock(mu_);
    auto it = data_.find(quiz_id);
    if (it == data_.end()) return std::nullopt;
    it->second.published = true;
    return it->second;
  }

private:
  mutable std::mutex mu_;
  std::unordered_map<std::string, QuizDraft> data_;
};

QuizStore& store() {
  static QuizStore s;
  return s;
}

Json::Value questionToJson(const QuizQuestionDraft& q) {
  Json::Value out;
  out["id"] = q.id;
  out["text"] = q.text;
  for (const auto& option : q.options) out["options"].append(option);
  out["correctIndex"] = q.correct_index;
  if (q.time_limit_sec) out["timeLimitSec"] = *q.time_limit_sec;
  return out;
}

Json::Value quizToJson(const QuizDraft& quiz) {
  Json::Value out;
  out["quizId"] = quiz.quiz_id;
  out["ownerUserId"] = quiz.owner_user_id;
  out["title"] = quiz.title;
  out["description"] = quiz.description;
  out["published"] = quiz.published;
  for (const auto& q : quiz.questions) out["questions"].append(questionToJson(q));
  return out;
}

std::optional<std::vector<QuizQuestionDraft>> parseQuestions(const Json::Value& body,
                                                             api::JsonValidator& validator,
                                                             bool required) {
  if (!body.isMember("questions")) {
    if (required) validator.addIssue("questions", "required");
    return required ? std::nullopt : std::optional<std::vector<QuizQuestionDraft>>{};
  }

  const auto& arr = body["questions"];
  if (!arr.isArray() || arr.empty()) {
    validator.addIssue("questions", "must_be_non_empty_array");
    return std::nullopt;
  }

  std::vector<QuizQuestionDraft> out;
  for (Json::ArrayIndex i = 0; i < arr.size(); ++i) {
    const auto& row = arr[i];
    if (!row.isObject()) {
      validator.addIssue("questions", "type_mismatch");
      return std::nullopt;
    }
    QuizQuestionDraft q;
    q.id = util::random_hex(8);

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

    if (!row.isMember("correctIndex") || !row["correctIndex"].isInt()) {
      validator.addIssue("questions[" + std::to_string(i) + "].correctIndex", "required");
      return std::nullopt;
    }
    q.correct_index = row["correctIndex"].asInt();
    if (q.correct_index < 0 || q.correct_index >= static_cast<int>(q.options.size())) {
      validator.addIssue("questions[" + std::to_string(i) + "].correctIndex", "out_of_range");
      return std::nullopt;
    }

    if (row.isMember("timeLimitSec")) {
      if (!row["timeLimitSec"].isInt() || row["timeLimitSec"].asInt() <= 0) {
        validator.addIssue("questions[" + std::to_string(i) + "].timeLimitSec", "must_be_positive");
        return std::nullopt;
      }
      q.time_limit_sec = row["timeLimitSec"].asInt();
    }

    out.push_back(std::move(q));
  }
  return out;
}

}  // namespace

namespace controllers {

void RegisterQuizRoutes(const Config& conf, QuizCoreClient&) {
  drogon::app().registerHandler(
      "/api/v1/quizzes",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
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

        QuizDraft draft;
        draft.quiz_id = util::random_hex(16);
        draft.owner_user_id = owner.value_or(resolveUserId(req, conf));
        draft.title = *title;
        draft.description = description.value_or("");
        draft.questions = *questions;
        auto saved = store().upsert(draft);

        Json::Value responseBody;
        responseBody["quiz"] = quizToJson(saved);
        responseBody["status"] = "created_in_gateway_memory";
        responseBody["todo"] = "Integrate QuizService gRPC in gateway client";
        cb(drogon::HttpResponse::newHttpJsonResponse(responseBody));
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/api/v1/quizzes",
      [](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        const int limit = req->getOptionalParameter<int>("limit").value_or(20);
        const int offset = req->getOptionalParameter<int>("offset").value_or(0);

        std::optional<std::string> owner;
        const auto ownerRaw = req->getParameter("ownerUserId");
        if (!ownerRaw.empty()) owner = ownerRaw;

        std::optional<bool> published;
        if (req->getParameter("published") == "true") published = true;
        if (req->getParameter("published") == "false") published = false;

        Json::Value out;
        out["limit"] = limit;
        out["offset"] = offset;
        const auto rows = store().list(owner, published, limit, offset);
        for (const auto& row : rows) out["items"].append(quizToJson(row));
        cb(drogon::HttpResponse::newHttpJsonResponse(out));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/api/v1/quizzes/{1}",
      [](const drogon::HttpRequestPtr&, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string quizId) {
        const auto quiz = store().get(quizId);
        if (!quiz) {
          cb(api::jsonErrorResponse(404, api::ErrorCode::kNotFound, "quiz not found"));
          return;
        }
        Json::Value out;
        out["quiz"] = quizToJson(*quiz);
        cb(drogon::HttpResponse::newHttpJsonResponse(out));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/api/v1/quizzes/{1}",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string quizId) {
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
        std::optional<std::vector<QuizQuestionDraft>> questions;
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

        const auto patched = store().patch(quizId, title, description, questions);
        if (!patched) {
          cb(api::jsonErrorResponse(404, api::ErrorCode::kNotFound, "quiz not found"));
          return;
        }

        Json::Value out;
        out["quiz"] = quizToJson(*patched);
        out["status"] = "updated_in_gateway_memory";
        cb(drogon::HttpResponse::newHttpJsonResponse(out));
      },
      {drogon::Patch});

  drogon::app().registerHandler(
      "/api/v1/quizzes/{1}/publish",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string quizId) {
        if (!RequireCsrf(req, conf, cb)) return;
        const auto published = store().publish(quizId);
        if (!published) {
          cb(api::jsonErrorResponse(404, api::ErrorCode::kNotFound, "quiz not found"));
          return;
        }

        Json::Value out;
        out["quiz"] = quizToJson(*published);
        out["status"] = "published_in_gateway_memory";
        cb(drogon::HttpResponse::newHttpJsonResponse(out));
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/api/v1/quizzes/ai-generate",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        if (!RequireCsrf(req, conf, cb)) return;

        std::string parseError;
        auto body = api::parseJsonBody(req, parseError);
        if (!body) {
          cb(api::jsonErrorResponse(400, api::ErrorCode::kInvalidJson, parseError));
          return;
        }

        api::JsonValidator validator(*body);
        auto prompt = validator.requiredString("prompt");
        if (!validator.ok()) {
          cb(api::validationErrorResponse(validator.issues()));
          return;
        }

        Json::Value out;
        out["jobId"] = util::random_hex(12);
        out["status"] = "queued_mock";
        out["note"] = "TODO: wire to QuizService.StartAiQuizJob";
        out["promptEcho"] = *prompt;
        cb(drogon::HttpResponse::newHttpJsonResponse(out));
      },
      {drogon::Post});
}

}  // namespace controllers
