#include "controllers/AuthStorage.hpp"

#include <drogon/orm/DbClient.h>
#include <drogon/utils/Utilities.h>

#include <mutex>
#include <regex>

namespace {

struct PgConn final {
  std::string host;
  std::string db;
  std::string user;
  std::string password;
  unsigned short port = 5432;
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

std::mutex g_dbMu;
drogon::orm::DbClientPtr g_db;

std::optional<drogon::orm::DbClientPtr> authDb(const Config& conf) {
  std::lock_guard lk(g_dbMu);
  if (g_db) return g_db;
  const auto parsed = parsePg(conf.database_url);
  if (!parsed) return std::nullopt;
  const auto connInfo = "host=" + parsed->host + " port=" + std::to_string(parsed->port) + " dbname=" + parsed->db +
                        " user=" + parsed->user + " password=" + parsed->password + " application_name=auth-db";
  g_db = drogon::orm::DbClient::newPgClient(connInfo, 1, false);
  return g_db;
}

controllers::StoredUser mapUser(const drogon::orm::Row& row) {
  controllers::StoredUser out;
  out.id = row["id"].as<std::string>();
  out.email = row["email"].as<std::string>();
  out.display_name = row["display_name"].as<std::string>();
  out.avatar_url = row["avatar_url"].isNull() ? "" : row["avatar_url"].as<std::string>();
  out.role = row["role"].as<std::string>();
  out.banned = row["banned"].as<bool>();
  return out;
}

}  // namespace

namespace controllers {

bool EnsureAuthSchema(const Config& conf, std::string& error) {
  const auto db = authDb(conf);
  if (!db) {
    error = "cannot parse DATABASE_URL for postgres auth storage";
    return false;
  }
  try {
    (*db)->execSqlSync("CREATE EXTENSION IF NOT EXISTS pgcrypto;");
    (*db)->execSqlSync(
        "CREATE TABLE IF NOT EXISTS gateway_users ("
        "id UUID PRIMARY KEY,"
        "email TEXT UNIQUE NOT NULL,"
        "password_hash TEXT NOT NULL,"
        "display_name TEXT NOT NULL,"
        "avatar_url TEXT,"
        "role TEXT NOT NULL DEFAULT 'user',"
        "banned BOOLEAN NOT NULL DEFAULT FALSE,"
        "ban_reason TEXT,"
        "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),"
        "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
        ");");
    return true;
  } catch (const std::exception& ex) {
    error = ex.what();
    return false;
  }
}

std::optional<StoredUser> FindUserByEmail(const Config& conf, const std::string& email, std::string& error) {
  const auto db = authDb(conf);
  if (!db) {
    error = "cannot parse DATABASE_URL for postgres auth storage";
    return std::nullopt;
  }
  try {
    auto result = (*db)->execSqlSync(
        "SELECT id, email, display_name, avatar_url, role, banned FROM gateway_users WHERE lower(email)=lower($1)", email);
    if (result.empty()) return std::nullopt;
    return mapUser(result[0]);
  } catch (const std::exception& ex) {
    error = ex.what();
    return std::nullopt;
  }
}

std::optional<StoredUser> FindUserById(const Config& conf, const std::string& userId, std::string& error) {
  const auto db = authDb(conf);
  if (!db) {
    error = "cannot parse DATABASE_URL for postgres auth storage";
    return std::nullopt;
  }
  try {
    auto result = (*db)->execSqlSync(
        "SELECT id, email, display_name, avatar_url, role, banned FROM gateway_users WHERE id=$1", userId);
    if (result.empty()) return std::nullopt;
    return mapUser(result[0]);
  } catch (const std::exception& ex) {
    error = ex.what();
    return std::nullopt;
  }
}

bool CreateUser(const Config& conf,
                const std::string& email,
                const std::string& password,
                const std::string& displayName,
                StoredUser& created,
                std::string& error,
                bool& emailTaken) {
  emailTaken = false;
  const auto db = authDb(conf);
  if (!db) {
    error = "cannot parse DATABASE_URL for postgres auth storage";
    return false;
  }
  try {
    const auto id = drogon::utils::getUuid();
    auto result = (*db)->execSqlSync(
        "INSERT INTO gateway_users (id, email, password_hash, display_name) "
        "VALUES ($1, lower($2), crypt($3, gen_salt('bf', 12)), $4) "
        "RETURNING id, email, display_name, avatar_url, role, banned",
        id, email, password, displayName);
    created = mapUser(result[0]);
    return true;
  } catch (const drogon::orm::DrogonDbException& ex) {
    const std::string what = ex.base().what();
    if (what.find("duplicate key") != std::string::npos) {
      emailTaken = true;
      return false;
    }
    error = what;
    return false;
  } catch (const std::exception& ex) {
    error = ex.what();
    return false;
  }
}

bool VerifyPassword(const Config& conf, const std::string& email, const std::string& password, StoredUser& user, std::string& error) {
  const auto db = authDb(conf);
  if (!db) {
    error = "cannot parse DATABASE_URL for postgres auth storage";
    return false;
  }
  try {
    auto result = (*db)->execSqlSync(
        "SELECT id, email, display_name, avatar_url, role, banned "
        "FROM gateway_users "
        "WHERE lower(email)=lower($1) AND password_hash = crypt($2, password_hash)",
        email,
        password);
    if (result.empty()) return false;
    user = mapUser(result[0]);
    return true;
  } catch (const std::exception& ex) {
    error = ex.what();
    return false;
  }
}

bool UpdateProfile(const Config& conf,
                   const std::string& userId,
                   const std::optional<std::string>& displayName,
                   const std::optional<std::string>& avatarUrl,
                   StoredUser& updated,
                   std::string& error) {
  const auto db = authDb(conf);
  if (!db) {
    error = "cannot parse DATABASE_URL for postgres auth storage";
    return false;
  }
  try {
    std::optional<drogon::orm::Result> result;
    if (displayName.has_value() && avatarUrl.has_value()) {
      result.emplace((*db)->execSqlSync(
          "UPDATE gateway_users SET display_name=$2, avatar_url=$3, updated_at=NOW() "
          "WHERE id = $1 RETURNING id, email, display_name, avatar_url, role, banned",
          userId,
          *displayName,
          *avatarUrl));
    } else if (displayName.has_value()) {
      result.emplace((*db)->execSqlSync(
          "UPDATE gateway_users SET display_name=$2, updated_at=NOW() "
          "WHERE id = $1 RETURNING id, email, display_name, avatar_url, role, banned",
          userId,
          *displayName));
    } else if (avatarUrl.has_value()) {
      result.emplace((*db)->execSqlSync(
          "UPDATE gateway_users SET avatar_url=$2, updated_at=NOW() "
          "WHERE id = $1 RETURNING id, email, display_name, avatar_url, role, banned",
          userId,
          *avatarUrl));
    } else {
      error = "nothing to update";
      return false;
    }
    if (result->empty()) {
      error = "user not found";
      return false;
    }
    updated = mapUser((*result)[0]);
    return true;
  } catch (const std::exception& ex) {
    error = ex.what();
    return false;
  }
}

bool ChangePassword(const Config& conf,
                    const std::string& userId,
                    const std::string& currentPassword,
                    const std::string& newPassword,
                    std::string& error,
                    bool& mismatch) {
  mismatch = false;
  const auto db = authDb(conf);
  if (!db) {
    error = "cannot parse DATABASE_URL for postgres auth storage";
    return false;
  }
  try {
    auto result = (*db)->execSqlSync(
        "UPDATE gateway_users "
        "SET password_hash = crypt($3, gen_salt('bf', 12)), updated_at = NOW() "
        "WHERE id = $1 AND password_hash = crypt($2, password_hash)",
        userId,
        currentPassword,
        newPassword);
    if (result.affectedRows() == 0) mismatch = true;
    return true;
  } catch (const std::exception& ex) {
    error = ex.what();
    return false;
  }
}

Json::Value LoadAdminStats(const Config& conf, std::string& error) {
  Json::Value out;
  const auto db = authDb(conf);
  if (!db) {
    error = "cannot parse DATABASE_URL for postgres auth storage";
    return out;
  }
  try {
    const auto users = (*db)->execSqlSync("SELECT count(*) AS c FROM gateway_users");
    const auto games = (*db)->execSqlSync("SELECT count(*) AS c FROM quizzes");
    const auto active = (*db)->execSqlSync("SELECT count(*) AS c FROM rooms WHERE state IN ('lobby','in_progress')");
    out["usersCount"] = users[0]["c"].as<int64_t>();
    out["gamesCount"] = games[0]["c"].as<int64_t>();
    out["activeRooms"] = active[0]["c"].as<int64_t>();
  } catch (const std::exception& ex) {
    error = ex.what();
  }
  return out;
}

bool SetUserBan(const Config& conf, const std::string& userId, bool banned, const std::string& reason, std::string& error, bool& found) {
  found = false;
  const auto db = authDb(conf);
  if (!db) {
    error = "cannot parse DATABASE_URL for postgres auth storage";
    return false;
  }
  try {
    auto result = (*db)->execSqlSync(
        "UPDATE gateway_users SET banned=$2, ban_reason=$3, updated_at=NOW() WHERE id=$1", userId, banned, reason);
    found = result.affectedRows() > 0;
    return true;
  } catch (const std::exception& ex) {
    error = ex.what();
    return false;
  }
}

}  // namespace controllers
