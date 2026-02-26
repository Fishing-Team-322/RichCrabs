#include "http_api_utils.hpp"

#include <json/json.h>

#include <regex>
#include <utility>

namespace {

bool isUuid(const std::string& value) {
  static const std::regex kUuid(
      R"(^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$)");
  return std::regex_match(value, kUuid);
}

}  // namespace

namespace api {

JsonValidator::JsonValidator(const Json::Value& body) : body_(body) {}

std::optional<std::string> JsonValidator::requiredString(const std::string& field,
                                                         const std::string& legacyField) {
  return readString(field, legacyField, true, false);
}

std::optional<std::string> JsonValidator::requiredUuid(const std::string& field,
                                                       const std::string& legacyField) {
  return readString(field, legacyField, true, true);
}

bool JsonValidator::ok() const { return issues_.empty(); }

Json::Value JsonValidator::errorResponse() const {
  Json::Value details(Json::arrayValue);
  for (const auto& issue : issues_) {
    Json::Value item;
    item["field"] = issue.field;
    item["reason"] = issue.reason;
    details.append(std::move(item));
  }
  Json::Value root;
  root["error"] = std::string(toString(ErrorCode::kValidationError));
  root["message"] = "request validation failed";
  root["details"] = std::move(details);
  return root;
}

std::optional<std::string> JsonValidator::readString(const std::string& field,
                                                     const std::string& legacyField,
                                                     bool required,
                                                     bool uuid) {
  const Json::Value* value = nullptr;
  if (body_.isMember(field)) {
    value = &body_[field];
  } else if (!legacyField.empty() && body_.isMember(legacyField)) {
    value = &body_[legacyField];
  }

  if (!value) {
    if (required) issues_.push_back({field, "required"});
    return std::nullopt;
  }

  if (!value->isString()) {
    issues_.push_back({field, "type_mismatch"});
    return std::nullopt;
  }

  const auto asString = value->asString();
  if (asString.empty()) {
    issues_.push_back({field, "required"});
    return std::nullopt;
  }

  if (uuid && !isUuid(asString)) {
    issues_.push_back({field, "invalid_uuid"});
    return std::nullopt;
  }

  return asString;
}

std::optional<Json::Value> parseJsonBody(const drogon::HttpRequestPtr& req, std::string& error) {
  Json::CharReaderBuilder builder;
  builder["collectComments"] = false;
  Json::Value root;
  std::string errs;

  const auto body = req->body();
  if (body.empty()) {
    error = "request body is empty";
    return std::nullopt;
  }

  std::unique_ptr<Json::CharReader> reader(builder.newCharReader());
  const char* begin = body.data();
  const char* end = begin + body.size();
  if (!reader->parse(begin, end, &root, &errs)) {
    error = errs.empty() ? "json parse error" : errs;
    return std::nullopt;
  }

  if (!root.isObject()) {
    error = "json body must be an object";
    return std::nullopt;
  }

  return root;
}

std::string_view toString(ErrorCode code) {
  switch (code) {
    case ErrorCode::kInvalidJson: return "invalid_json";
    case ErrorCode::kValidationError: return "validation_error";
    case ErrorCode::kUnauthorized: return "unauthorized";
    case ErrorCode::kCsrfRequired: return "csrf_required";
    case ErrorCode::kForbidden: return "forbidden";
    case ErrorCode::kNotFound: return "not_found";
    case ErrorCode::kEmailTaken: return "email_taken";
    case ErrorCode::kTooManyAttempts: return "too_many_attempts";
    case ErrorCode::kNotImplemented: return "not_implemented";
    case ErrorCode::kGrpcUnavailable: return "grpc_unavailable";
    case ErrorCode::kGrpcTimeout: return "grpc_timeout";
  }
  return "validation_error";
}


drogon::HttpResponsePtr jsonErrorResponse(int code,
                                          ErrorCode error,
                                          const std::string& message,
                                          std::optional<Json::Value> details) {
  Json::Value body;
  body["error"] = std::string(toString(error));
  body["message"] = message;
  if (details.has_value()) body["details"] = std::move(*details);
  auto resp = drogon::HttpResponse::newHttpJsonResponse(body);
  resp->setStatusCode(static_cast<drogon::HttpStatusCode>(code));
  return resp;
}

drogon::HttpResponsePtr validationErrorResponse(const std::vector<ValidationIssue>& issues) {
  Json::Value details(Json::arrayValue);
  for (const auto& issue : issues) {
    Json::Value row;
    row["field"] = issue.field;
    row["reason"] = issue.reason;
    details.append(std::move(row));
  }
  return jsonErrorResponse(400, ErrorCode::kValidationError, "request validation failed", std::move(details));
}

GatewayError mapRpcError(QuizCoreRpcStatus status, const std::string& operation) {
  switch (status) {
    case QuizCoreRpcStatus::kInvalidArgument:
      return {GatewayErrorKind::kBadGateway, ErrorCode::kGrpcUnavailable, "grpc call failed: " + operation, std::nullopt};
    case QuizCoreRpcStatus::kNotFound:
      return {GatewayErrorKind::kBadGateway, ErrorCode::kGrpcUnavailable, "grpc call failed: " + operation, std::nullopt};
    case QuizCoreRpcStatus::kPermissionDenied:
      return {GatewayErrorKind::kBadGateway, ErrorCode::kGrpcUnavailable, "grpc call failed: " + operation, std::nullopt};
    case QuizCoreRpcStatus::kFailedPrecondition:
      return {GatewayErrorKind::kBadGateway, ErrorCode::kGrpcUnavailable, "grpc call failed: " + operation, std::nullopt};
    case QuizCoreRpcStatus::kDeadlineExceeded:
      return {GatewayErrorKind::kGatewayTimeout, ErrorCode::kGrpcTimeout, "grpc timeout: " + operation, std::nullopt};
    case QuizCoreRpcStatus::kUnavailable:
      return {GatewayErrorKind::kBadGateway, ErrorCode::kGrpcUnavailable, "grpc unavailable: " + operation, std::nullopt};
    case QuizCoreRpcStatus::kUnknown:
    case QuizCoreRpcStatus::kOk:
    default:
      return {GatewayErrorKind::kBadGateway, ErrorCode::kGrpcUnavailable, "grpc unavailable: " + operation, std::nullopt};
  }
}

int httpStatusCode(GatewayErrorKind kind) {
  switch (kind) {
    case GatewayErrorKind::kBadRequest: return 400;
    case GatewayErrorKind::kNotFound: return 404;
    case GatewayErrorKind::kForbidden: return 403;
    case GatewayErrorKind::kConflict: return 409;
    case GatewayErrorKind::kGatewayTimeout: return 504;
    case GatewayErrorKind::kServiceUnavailable: return 503;
    case GatewayErrorKind::kBadGateway:
    default: return 502;
  }
}

drogon::HttpResponsePtr jsonErrorResponse(const GatewayError& error) {
  return jsonErrorResponse(httpStatusCode(error.kind), error.error, error.message, error.details);
}

}  // namespace api
