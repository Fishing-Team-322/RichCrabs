#pragma once

#include <drogon/drogon.h>

#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include <json/value.h>

#include "quizcore_client.hpp"

namespace api {

enum class ErrorCode {
  kInvalidJson,
  kValidationError,
  kUnauthorized,
  kCsrfRequired,
  kForbidden,
  kNotFound,
  kEmailTaken,
  kTooManyAttempts,
  kNotImplemented,
  kGrpcUnavailable,
  kGrpcTimeout,
};

std::string_view toString(ErrorCode code);

struct ValidationIssue final {
  std::string field;
  std::string reason;
};

class JsonValidator final {
public:
  explicit JsonValidator(const Json::Value& body);

  std::optional<std::string> requiredString(const std::string& field,
                                            const std::string& legacyField = "");
  std::optional<std::string> requiredUuid(const std::string& field,
                                          const std::string& legacyField = "");

  [[nodiscard]] bool ok() const;
  [[nodiscard]] Json::Value errorResponse() const;

private:
  const Json::Value& body_;
  std::vector<ValidationIssue> issues_;

  std::optional<std::string> readString(const std::string& field,
                                        const std::string& legacyField,
                                        bool required,
                                        bool uuid);
};

std::optional<Json::Value> parseJsonBody(const drogon::HttpRequestPtr& req, std::string& error);

drogon::HttpResponsePtr jsonErrorResponse(int code,
                                          ErrorCode error,
                                          const std::string& message,
                                          std::optional<Json::Value> details = std::nullopt);
drogon::HttpResponsePtr validationErrorResponse(const std::vector<ValidationIssue>& issues);

enum class GatewayErrorKind {
  kBadRequest,
  kNotFound,
  kForbidden,
  kConflict,
  kBadGateway,
  kGatewayTimeout,
  kServiceUnavailable,
};

struct GatewayError final {
  GatewayErrorKind kind;
  ErrorCode error;
  std::string message;
  std::optional<Json::Value> details;
};

GatewayError mapRpcError(QuizCoreRpcStatus status, const std::string& operation);
int httpStatusCode(GatewayErrorKind kind);
drogon::HttpResponsePtr jsonErrorResponse(const GatewayError& error);

}  // namespace api
