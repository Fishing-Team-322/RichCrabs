#include "ws_gateway.hpp"

#include "config.hpp"
#include "session.hpp"

#include <json/reader.h>
#include <json/value.h>
#include <sstream>

void WsGateway::handleNewConnection(const drogon::HttpRequestPtr& req,
                                    const drogon::WebSocketConnectionPtr& conn) {
  const auto conf = Config::LoadFromEnv();
  auto claims = security::VerifySessionFromRequest(req, conf.session);
  if (!claims) { conn->shutdown(); return; }

  conn->send(R"({"type":"hello"})");
}

void WsGateway::handleNewMessage(const drogon::WebSocketConnectionPtr& conn,
                                 std::string&& message,
                                 const drogon::WebSocketMessageType& type) {
  if (type != drogon::WebSocketMessageType::Text) return;

  Json::Value j;
  Json::CharReaderBuilder b;
  std::string errs;
  std::istringstream iss(message);
  if (!Json::parseFromStream(b, iss, &j, &errs)) {
    conn->send(R"({"type":"error","error":"invalid_json"})");
    return;
  }

  const std::string t = j.get("type", "").asString();
  if (t == "ping") {
    conn->send(R"({"type":"pong"})");
    return;
  }

  conn->send(R"({"type":"ack"})");
}

void WsGateway::handleConnectionClosed(const drogon::WebSocketConnectionPtr&) {}
