#include "controllers/AuthStorage.hpp"

#include <grpcpp/grpcpp.h>

#include <chrono>
#include <mutex>

#include "auth.grpc.pb.h"

namespace {

using richcrab::v1::AuthService;

std::mutex g_mu;
std::shared_ptr<grpc::Channel> g_channel;
std::unique_ptr<AuthService::Stub> g_stub;
std::string g_addr;

AuthService::Stub* authStub(const Config& conf) {
  std::lock_guard lk(g_mu);
  if (!g_stub || g_addr != conf.grpc_auth_addr) {
    g_addr = conf.grpc_auth_addr;
    g_channel = grpc::CreateChannel(conf.grpc_auth_addr, grpc::InsecureChannelCredentials());
    g_stub = AuthService::NewStub(g_channel);
  }
  return g_stub.get();
}

void setDeadline(grpc::ClientContext& ctx, int ms) {
  ctx.set_deadline(std::chrono::system_clock::now() + std::chrono::milliseconds(ms));
}

StoredUser mapUser(const richcrab::v1::AuthUser& user) {
  StoredUser out;
  out.id = user.id();
  out.email = user.email();
  out.display_name = user.display_name();
  out.avatar_url = user.avatar_url();
  out.role = user.role();
  out.banned = user.banned();
  return out;
}

}  // namespace

namespace controllers {

bool EnsureAuthSchema(const Config& conf, std::string& error) {
  grpc::ClientContext ctx;
  setDeadline(ctx, conf.grpc_deadline_ms_auth);
  richcrab::v1::EnsureSchemaRequest req;
  richcrab::v1::EnsureSchemaResponse res;
  const auto status = authStub(conf)->EnsureSchema(&ctx, req, &res);
  if (!status.ok()) {
    error = status.error_message();
    return false;
  }
  if (!res.ok()) {
    error = "ensure schema failed";
    return false;
  }
  return true;
}

std::optional<StoredUser> FindUserByEmail(const Config&, const std::string&, std::string& error) {
  error = "FindUserByEmail is not implemented via auth gRPC";
  return std::nullopt;
}

std::optional<StoredUser> FindUserById(const Config& conf, const std::string& userId, std::string& error) {
  grpc::ClientContext ctx;
  setDeadline(ctx, conf.grpc_deadline_ms_auth);
  richcrab::v1::GetMeRequest req;
  req.mutable_user_id()->set_value(userId);
  richcrab::v1::GetMeResponse res;
  const auto status = authStub(conf)->GetMe(&ctx, req, &res);
  if (!status.ok()) {
    error = status.error_message();
    return std::nullopt;
  }
  if (!res.found() || !res.has_user()) return std::nullopt;
  return mapUser(res.user());
}

bool CreateUser(const Config& conf,
                const std::string& email,
                const std::string& password,
                const std::string& displayName,
                StoredUser& created,
                std::string& error,
                bool& emailTaken) {
  emailTaken = false;
  grpc::ClientContext ctx;
  setDeadline(ctx, conf.grpc_deadline_ms_auth);
  richcrab::v1::RegisterRequest req;
  req.set_email(email);
  req.set_password(password);
  req.set_display_name(displayName);
  richcrab::v1::RegisterResponse res;
  const auto status = authStub(conf)->Register(&ctx, req, &res);
  if (!status.ok()) {
    error = status.error_message();
    return false;
  }
  if (res.email_taken()) {
    emailTaken = true;
    return false;
  }
  if (!res.created() || !res.has_user()) {
    error = "register failed";
    return false;
  }
  created = mapUser(res.user());
  return true;
}

bool VerifyPassword(const Config& conf, const std::string& email, const std::string& password, StoredUser& user, std::string& error) {
  grpc::ClientContext ctx;
  setDeadline(ctx, conf.grpc_deadline_ms_auth);
  richcrab::v1::LoginRequest req;
  req.set_email(email);
  req.set_password(password);
  richcrab::v1::LoginResponse res;
  const auto status = authStub(conf)->Login(&ctx, req, &res);
  if (!status.ok()) {
    error = status.error_message();
    return false;
  }
  if (!res.authenticated() || !res.has_user()) return false;
  user = mapUser(res.user());
  return true;
}

bool Logout(const Config& conf, const std::string& userId, std::string& error) {
  grpc::ClientContext ctx;
  setDeadline(ctx, conf.grpc_deadline_ms_auth);
  richcrab::v1::LogoutRequest req;
  if (!userId.empty()) req.mutable_user_id()->set_value(userId);
  richcrab::v1::LogoutResponse res;
  const auto status = authStub(conf)->Logout(&ctx, req, &res);
  if (!status.ok()) {
    error = status.error_message();
    return false;
  }
  return res.ok();
}

bool UpdateProfile(const Config& conf,
                   const std::string& userId,
                   const std::optional<std::string>& displayName,
                   const std::optional<std::string>& avatarUrl,
                   StoredUser& updated,
                   std::string& error) {
  grpc::ClientContext ctx;
  setDeadline(ctx, conf.grpc_deadline_ms_auth);
  richcrab::v1::UpdateProfileRequest req;
  req.mutable_user_id()->set_value(userId);
  if (displayName.has_value()) req.set_display_name(*displayName);
  if (avatarUrl.has_value()) req.set_avatar_url(*avatarUrl);
  richcrab::v1::UpdateProfileResponse res;
  const auto status = authStub(conf)->UpdateProfile(&ctx, req, &res);
  if (!status.ok()) {
    error = status.error_message();
    return false;
  }
  if (res.not_found()) {
    error = "user not found";
    return false;
  }
  if (!res.updated() || !res.has_user()) {
    error = "update profile failed";
    return false;
  }
  updated = mapUser(res.user());
  return true;
}

bool ChangePassword(const Config& conf,
                    const std::string& userId,
                    const std::string& currentPassword,
                    const std::string& newPassword,
                    std::string& error,
                    bool& mismatch) {
  mismatch = false;
  grpc::ClientContext ctx;
  setDeadline(ctx, conf.grpc_deadline_ms_auth);
  richcrab::v1::ChangePasswordRequest req;
  req.mutable_user_id()->set_value(userId);
  req.set_current_password(currentPassword);
  req.set_new_password(newPassword);
  richcrab::v1::ChangePasswordResponse res;
  const auto status = authStub(conf)->ChangePassword(&ctx, req, &res);
  if (!status.ok()) {
    error = status.error_message();
    return false;
  }
  mismatch = res.mismatch();
  return true;
}

Json::Value LoadAdminStats(const Config& conf, std::string& error) {
  Json::Value out;
  grpc::ClientContext ctx;
  setDeadline(ctx, conf.grpc_deadline_ms_auth);
  richcrab::v1::GetAdminStatsRequest req;
  richcrab::v1::GetAdminStatsResponse res;
  const auto status = authStub(conf)->GetAdminStats(&ctx, req, &res);
  if (!status.ok()) {
    error = status.error_message();
    return out;
  }
  out["usersCount"] = res.users_count();
  out["gamesCount"] = res.games_count();
  out["activeRooms"] = res.active_rooms();
  return out;
}

bool SetUserBan(const Config& conf, const std::string& userId, bool banned, const std::string& reason, std::string& error, bool& found) {
  found = false;
  grpc::ClientContext ctx;
  setDeadline(ctx, conf.grpc_deadline_ms_auth);
  richcrab::v1::SetUserBanRequest req;
  req.mutable_user_id()->set_value(userId);
  req.set_banned(banned);
  req.set_reason(reason);
  richcrab::v1::SetUserBanResponse res;
  const auto status = authStub(conf)->SetUserBan(&ctx, req, &res);
  if (!status.ok()) {
    error = status.error_message();
    return false;
  }
  found = res.found();
  return true;
}

}  // namespace controllers
