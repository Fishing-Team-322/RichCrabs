#pragma once

#include <optional>
#include <string>

#include <drogon/drogon.h>

#include "config.hpp"

namespace controllers {

struct StoredUser final {
  std::string id;
  std::string email;
  std::string display_name;
  std::string avatar_url;
  std::string role;
  bool banned = false;
};

bool EnsureAuthSchema(const Config& conf, std::string& error);
std::optional<StoredUser> FindUserByEmail(const Config& conf, const std::string& email, std::string& error);
std::optional<StoredUser> FindUserById(const Config& conf, const std::string& userId, std::string& error);
bool CreateUser(const Config& conf,
                const std::string& email,
                const std::string& password,
                const std::string& displayName,
                StoredUser& created,
                std::string& error,
                bool& emailTaken);
bool VerifyPassword(const Config& conf, const std::string& email, const std::string& password, StoredUser& user, std::string& error);
bool Logout(const Config& conf, const std::string& userId, std::string& error);
bool UpdateProfile(const Config& conf,
                   const std::string& userId,
                   const std::optional<std::string>& displayName,
                   const std::optional<std::string>& avatarUrl,
                   StoredUser& updated,
                   std::string& error);
bool ChangePassword(const Config& conf,
                    const std::string& userId,
                    const std::string& currentPassword,
                    const std::string& newPassword,
                    std::string& error,
                    bool& mismatch);
Json::Value LoadAdminStats(const Config& conf, std::string& error);
bool SetUserBan(const Config& conf, const std::string& userId, bool banned, const std::string& reason, std::string& error, bool& found);

}  // namespace controllers
