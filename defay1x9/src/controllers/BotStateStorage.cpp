#include "controllers/BotStateStorage.hpp"

#include <drogon/orm/DbClient.h>

#include <json/reader.h>
#include <json/writer.h>

#include <mutex>
#include <regex>
#include <sstream>

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

std::optional<drogon::orm::DbClientPtr> botDb(const Config& conf) {
  std::lock_guard lk(g_dbMu);
  if (g_db) return g_db;
  const auto parsed = parsePg(conf.database_url);
  if (!parsed) return std::nullopt;
  const auto connInfo = "host=" + parsed->host + " port=" + std::to_string(parsed->port) + " dbname=" + parsed->db +
                        " user=" + parsed->user + " password=" + parsed->password + " application_name=bot-state-db";
  g_db = drogon::orm::DbClient::newPgClient(connInfo, 1, false);
  return g_db;
}

Json::Value parseMetadata(const std::string& raw) {
  Json::CharReaderBuilder b;
  Json::Value parsed;
  std::string errs;
  std::istringstream iss(raw);
  if (Json::parseFromStream(b, iss, &parsed, &errs) && parsed.isObject()) return parsed;
  return Json::Value(Json::objectValue);
}

controllers::BotState mapState(const drogon::orm::Row& row) {
  controllers::BotState out;
  out.bot_id = row["bot_id"].as<std::string>();
  out.owner_user_id = row["owner_user_id"].as<std::string>();
  if (!row["name"].isNull()) out.name = row["name"].as<std::string>();
  out.enabled = row["enabled"].as<bool>();
  out.metadata = parseMetadata(row["metadata"].as<std::string>());
  return out;
}

}  // namespace

namespace controllers {

bool EnsureBotStateSchema(const Config& conf, std::string& error) {
  const auto db = botDb(conf);
  if (!db) {
    error = "cannot parse DATABASE_URL for bot state storage";
    return false;
  }
  try {
    (*db)->execSqlSync(
        "CREATE TABLE IF NOT EXISTS gateway_bot_state ("
        "bot_id TEXT PRIMARY KEY,"
        "owner_user_id TEXT NOT NULL,"
        "name TEXT,"
        "enabled BOOLEAN NOT NULL DEFAULT TRUE,"
        "metadata JSONB NOT NULL DEFAULT '{}'::jsonb,"
        "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
        ");");
    return true;
  } catch (const std::exception& ex) {
    error = ex.what();
    return false;
  }
}

std::optional<BotState> GetBotState(const Config& conf, const std::string& botId, std::string& error) {
  const auto db = botDb(conf);
  if (!db) {
    error = "cannot parse DATABASE_URL for bot state storage";
    return std::nullopt;
  }
  try {
    auto result = (*db)->execSqlSync("SELECT bot_id, owner_user_id, name, enabled, metadata FROM gateway_bot_state WHERE bot_id=$1", botId);
    if (result.empty()) return std::nullopt;
    return mapState(result[0]);
  } catch (const std::exception& ex) {
    error = ex.what();
    return std::nullopt;
  }
}

bool UpsertBotStatePatch(const Config& conf,
                         const std::string& botId,
                         const std::string& ownerUserId,
                         const std::optional<std::string>& name,
                         const std::optional<bool>& enabled,
                         const std::optional<Json::Value>& metadata,
                         BotState& updated,
                         std::string& error,
                         bool& conflict) {
  conflict = false;
  const auto db = botDb(conf);
  if (!db) {
    error = "cannot parse DATABASE_URL for bot state storage";
    return false;
  }

  auto current = GetBotState(conf, botId, error);
  if (!error.empty()) return false;
  if (current && current->owner_user_id != ownerUserId) {
    conflict = true;
    return false;
  }

  const std::optional<std::string> finalName = name.has_value() ? name : (current ? current->name : std::optional<std::string>{});
  const bool finalEnabled = enabled.has_value() ? *enabled : (current ? current->enabled : true);
  const Json::Value finalMetadata = metadata.has_value() ? *metadata : (current ? current->metadata : Json::Value(Json::objectValue));

  Json::StreamWriterBuilder w;
  const std::string metadataJson = Json::writeString(w, finalMetadata);

  try {
    auto result = (*db)->execSqlSync(
        "INSERT INTO gateway_bot_state (bot_id, owner_user_id, name, enabled, metadata) "
        "VALUES ($1, $2, $3, $4, $5::jsonb) "
        "ON CONFLICT (bot_id) DO UPDATE SET "
        "owner_user_id = EXCLUDED.owner_user_id, "
        "name = EXCLUDED.name, "
        "enabled = EXCLUDED.enabled, "
        "metadata = EXCLUDED.metadata, "
        "updated_at = NOW() "
        "RETURNING bot_id, owner_user_id, name, enabled, metadata",
        botId,
        ownerUserId,
        finalName,
        finalEnabled,
        metadataJson);
    if (result.empty()) {
      conflict = true;
      return false;
    }
    updated = mapState(result[0]);
    return true;
  } catch (const std::exception& ex) {
    error = ex.what();
    return false;
  }
}

bool SeedBotStateOwner(const Config& conf,
                       const std::string& botId,
                       const std::string& ownerUserId,
                       const std::optional<std::string>& defaultName,
                       std::string& error) {
  const auto db = botDb(conf);
  if (!db) {
    error = "cannot parse DATABASE_URL for bot state storage";
    return false;
  }
  try {
    (*db)->execSqlSync(
        "INSERT INTO gateway_bot_state (bot_id, owner_user_id, name) VALUES ($1, $2, $3) "
        "ON CONFLICT (bot_id) DO NOTHING",
        botId,
        ownerUserId,
        defaultName);
    return true;
  } catch (const std::exception& ex) {
    error = ex.what();
    return false;
  }
}

}  // namespace controllers
