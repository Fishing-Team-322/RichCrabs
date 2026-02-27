#pragma once

#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <unordered_map>

#include "http_api_utils.hpp"

struct EntitlementLimit final {
  std::string limit;
  uint64_t used = 0;
  uint64_t max = 0;
  std::optional<std::string> retry_at;
};

struct EntitlementsSnapshot final {
  std::unordered_map<std::string, EntitlementLimit> limits;
};

struct UsageSnapshot final {
  std::unordered_map<std::string, uint64_t> usage;
  std::optional<std::string> period_ends_at;
};

struct EntitlementsClientError final {
  api::GatewayError gateway_error;
  std::optional<std::string> limit;
  std::optional<std::string> retry_at;
};

struct CheckAndConsumeResult final {
  bool allowed = false;
  std::optional<EntitlementsClientError> error;
};

class EntitlementsClient {
public:
  virtual ~EntitlementsClient() = default;

  virtual std::optional<EntitlementsSnapshot> getEntitlements(const std::string& userId,
                                                              EntitlementsClientError& error) = 0;
  virtual std::optional<UsageSnapshot> getUsage(const std::string& userId, EntitlementsClientError& error) = 0;
  virtual CheckAndConsumeResult checkAndConsume(const std::string& userId, const std::string& actionType) = 0;
};

class EntitlementsClientGrpc final : public EntitlementsClient {
public:
  EntitlementsClientGrpc(const std::string& entitlementsAddr,
                         int deadlineMs,
                         const std::string& redisUrl,
                         uint64_t roomsDailyLimit,
                         uint64_t botsDailyLimit,
                         uint64_t aiDailyLimit);
  ~EntitlementsClientGrpc() override;

  std::optional<EntitlementsSnapshot> getEntitlements(const std::string& userId,
                                                      EntitlementsClientError& error) override;
  std::optional<UsageSnapshot> getUsage(const std::string& userId, EntitlementsClientError& error) override;
  CheckAndConsumeResult checkAndConsume(const std::string& userId, const std::string& actionType) override;

private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};
