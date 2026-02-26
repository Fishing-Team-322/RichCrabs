#include "ws_gateway.hpp"

#include "config.hpp"
#include "game.grpc.pb.h"
#include "session.hpp"

#include <drogon/drogon.h>
#include <google/protobuf/util/json_util.h>
#include <grpcpp/grpcpp.h>
#include <json/reader.h>
#include <json/value.h>
#include <spdlog/spdlog.h>

#include <chrono>
#include <condition_variable>
#include <random>
#include <deque>
#include <memory>
#include <mutex>
#include <optional>
#include <set>
#include <sstream>
#include <string>
#include <thread>
#include <unordered_map>

namespace {
using richcrab::v1::GameService;
using richcrab::v1::GetRoomStateRequest;
using richcrab::v1::GetRoomStateResponse;
using richcrab::v1::RoomEvent;
using richcrab::v1::StartGameRequest;
using richcrab::v1::StartGameResponse;
using richcrab::v1::SubmitAnswerRequest;
using richcrab::v1::SubmitAnswerResponse;
using richcrab::v1::SubscribeRoomEventsRequest;

constexpr size_t kMaxRoomQueue = 256;
constexpr int kStreamMaxRetries = 3;

struct ConnSession final {
  std::string room_id;
  std::string role;
  std::string player_id;
  std::string user_id;
};

struct RoomHubEntry final {
  explicit RoomHubEntry(std::string id, std::shared_ptr<grpc::Channel> ch)
      : room_id(std::move(id)), game_stub(GameService::NewStub(std::move(ch))) {}

  std::string room_id;
  std::string subscriber_player_id;

  std::mutex mu;
  std::condition_variable cv;
  std::set<drogon::WebSocketConnectionPtr, std::owner_less<drogon::WebSocketConnectionPtr>> connections;
  std::deque<std::string> outbound_queue;
  bool stream_stop = false;
  bool stream_finished = false;
  std::thread stream_thread;
  std::thread dispatch_thread;

  std::unique_ptr<GameService::Stub> game_stub;
};

std::mutex g_hub_mu;
std::unordered_map<std::string, std::shared_ptr<RoomHubEntry>> g_room_hub;

std::mutex g_conn_mu;
std::unordered_map<const void*, ConnSession> g_conn_sessions;

std::shared_ptr<grpc::Channel> MakeChannel() {
  const auto conf = Config::LoadFromEnv();
  return grpc::CreateChannel(conf.grpc_game_addr, grpc::InsecureChannelCredentials());
}

std::string JsonString(const Json::Value& value) {
  Json::StreamWriterBuilder builder;
  builder["indentation"] = "";
  return Json::writeString(builder, value);
}

std::string GenerateRequestId() {
  static constexpr char kHex[] = "0123456789abcdef";
  static thread_local std::mt19937_64 rng{std::random_device{}()};
  std::uniform_int_distribution<uint64_t> dist(0, 0xffffffffffffffffULL);
  auto toHex = [&](uint64_t v) {
    std::string out(16, '0');
    for (int i = 15; i >= 0; --i) {
      out[i] = kHex[v & 0xF];
      v >>= 4;
    }
    return out;
  };
  return toHex(dist(rng)) + toHex(dist(rng));
}

void AttachRequestId(grpc::ClientContext& ctx, const std::string& requestId) {
  if (!requestId.empty()) ctx.AddMetadata("x-request-id", requestId);
}

void EnqueueRoomMessage(const std::shared_ptr<RoomHubEntry>& entry, std::string payload) {
  std::lock_guard<std::mutex> lock(entry->mu);
  if (entry->stream_stop) return;

  if (entry->outbound_queue.size() >= kMaxRoomQueue) {
    entry->outbound_queue.pop_front();  // drop oldest for backpressure
  }
  entry->outbound_queue.push_back(std::move(payload));
  entry->cv.notify_one();
}

void BroadcastError(const std::shared_ptr<RoomHubEntry>& entry, const std::string& err) {
  Json::Value j;
  j["type"] = "error";
  j["error"] = err;
  EnqueueRoomMessage(entry, JsonString(j));
}

void RunDispatchLoop(const std::shared_ptr<RoomHubEntry>& entry) {
  while (true) {
    std::string msg;
    {
      std::unique_lock<std::mutex> lock(entry->mu);
      entry->cv.wait(lock, [&] { return entry->stream_stop || !entry->outbound_queue.empty(); });
      if (entry->stream_stop && entry->outbound_queue.empty()) break;
      msg = std::move(entry->outbound_queue.front());
      entry->outbound_queue.pop_front();

      for (const auto& conn : entry->connections) {
        if (conn && conn->connected()) conn->send(msg);
      }
    }
  }
}

void RunStreamLoop(const std::shared_ptr<RoomHubEntry>& entry) {
  for (int attempt = 1; attempt <= kStreamMaxRetries; ++attempt) {
    {
      std::lock_guard<std::mutex> lock(entry->mu);
      if (entry->stream_stop) break;
    }

    grpc::ClientContext ctx;
    AttachRequestId(ctx, GenerateRequestId());
    SubscribeRoomEventsRequest req;
    req.mutable_room_id()->set_value(entry->room_id);
    {
      std::lock_guard<std::mutex> lock(entry->mu);
      if (!entry->subscriber_player_id.empty()) {
        req.mutable_subscriber_player_id()->set_value(entry->subscriber_player_id);
      }
    }

    auto reader = entry->game_stub->SubscribeRoomEvents(&ctx, req);
    RoomEvent event;
    while (reader->Read(&event)) {
      std::string eventJson;
      google::protobuf::util::MessageToJsonString(event, &eventJson);

      Json::Value wrapped;
      wrapped["type"] = "room_event";
      Json::Value parsedEvent;
      Json::CharReaderBuilder b;
      std::string errs;
      std::istringstream iss(eventJson);
      if (Json::parseFromStream(b, iss, &parsedEvent, &errs)) {
        wrapped["event"] = parsedEvent;
      } else {
        wrapped["event_raw"] = eventJson;
      }

      EnqueueRoomMessage(entry, JsonString(wrapped));

      std::lock_guard<std::mutex> lock(entry->mu);
      if (entry->stream_stop) {
        ctx.TryCancel();
        break;
      }
    }

    const auto status = reader->Finish();
    {
      std::lock_guard<std::mutex> lock(entry->mu);
      if (entry->stream_stop) break;
    }

    if (status.ok()) {
      BroadcastError(entry, "room_event_stream_closed");
    } else {
      BroadcastError(entry,
                     "room_event_stream_failed: " + status.error_message() +
                         " (attempt " + std::to_string(attempt) + "/" + std::to_string(kStreamMaxRetries) + ")");
    }

    if (attempt < kStreamMaxRetries) {
      std::this_thread::sleep_for(std::chrono::milliseconds(250 * attempt));
      continue;
    }
  }

  {
    std::lock_guard<std::mutex> lock(entry->mu);
    entry->stream_finished = true;
  }
}

void EnsureRoomThreads(const std::shared_ptr<RoomHubEntry>& entry) {
  std::lock_guard<std::mutex> lock(entry->mu);
  if (!entry->dispatch_thread.joinable()) {
    entry->dispatch_thread = std::thread([entry] { RunDispatchLoop(entry); });
  }
  if (!entry->stream_thread.joinable()) {
    entry->stream_thread = std::thread([entry] { RunStreamLoop(entry); });
  }
}

std::shared_ptr<RoomHubEntry> AcquireRoomEntry(const ConnSession& c) {
  std::lock_guard<std::mutex> lock(g_hub_mu);
  auto it = g_room_hub.find(c.room_id);
  if (it == g_room_hub.end()) {
    auto entry = std::make_shared<RoomHubEntry>(c.room_id, MakeChannel());
    if (!c.player_id.empty()) entry->subscriber_player_id = c.player_id;
    it = g_room_hub.emplace(c.room_id, std::move(entry)).first;
  }
  return it->second;
}

void StopRoomIfEmpty(const std::string& room_id) {
  std::shared_ptr<RoomHubEntry> entry;
  {
    std::lock_guard<std::mutex> lock(g_hub_mu);
    auto it = g_room_hub.find(room_id);
    if (it == g_room_hub.end()) return;
    entry = it->second;
    std::lock_guard<std::mutex> entryLock(entry->mu);
    if (!entry->connections.empty()) return;
    entry->stream_stop = true;
    entry->cv.notify_all();
    g_room_hub.erase(it);
  }

  if (entry->stream_thread.joinable()) entry->stream_thread.join();
  if (entry->dispatch_thread.joinable()) entry->dispatch_thread.join();
}

void SendError(const drogon::WebSocketConnectionPtr& conn, const std::string& err) {
  Json::Value j;
  j["type"] = "error";
  j["error"] = err;
  conn->send(JsonString(j));
}

std::optional<ConnSession> SessionForConn(const drogon::WebSocketConnectionPtr& conn) {
  std::lock_guard<std::mutex> lock(g_conn_mu);
  auto it = g_conn_sessions.find(conn.get());
  if (it == g_conn_sessions.end()) return std::nullopt;
  return it->second;
}

}  // namespace

void WsGateway::handleNewConnection(const drogon::HttpRequestPtr& req,
                                    const drogon::WebSocketConnectionPtr& conn) {
  auto conf = Config::LoadFromEnv();
  conf.session.cookie_name = "QB-SESSION";

  auto claims = security::VerifySessionFromRequest(req, conf.session);
  if (!claims || claims->room_id.empty()) {
    conn->shutdown();
    return;
  }

  ConnSession cs;
  cs.room_id = claims->room_id;
  cs.role = claims->role;
  cs.player_id = claims->player_id;
  cs.user_id = claims->user_id;

  {
    std::lock_guard<std::mutex> lock(g_conn_mu);
    g_conn_sessions[conn.get()] = cs;
  }

  spdlog::info("ws_connected pin=- room_id={} player_id={}", cs.room_id, cs.player_id.empty() ? "-" : cs.player_id);
  auto roomEntry = AcquireRoomEntry(cs);
  {
    std::lock_guard<std::mutex> lock(roomEntry->mu);
    roomEntry->connections.insert(conn);
    if (roomEntry->subscriber_player_id.empty() && !cs.player_id.empty()) {
      roomEntry->subscriber_player_id = cs.player_id;
    }
  }
  EnsureRoomThreads(roomEntry);

  Json::Value hello;
  hello["type"] = "hello";
  hello["roomId"] = cs.room_id;
  hello["role"] = cs.role;
  conn->send(JsonString(hello));
}

void WsGateway::handleNewMessage(const drogon::WebSocketConnectionPtr& conn,
                                 std::string&& message,
                                 const drogon::WebSocketMessageType& type) {
  if (type != drogon::WebSocketMessageType::Text) return;

  auto connSession = SessionForConn(conn);
  if (!connSession) {
    SendError(conn, "session_not_found");
    return;
  }

  Json::Value j;
  Json::CharReaderBuilder b;
  std::string errs;
  std::istringstream iss(message);
  if (!Json::parseFromStream(b, iss, &j, &errs)) {
    SendError(conn, "invalid_json");
    return;
  }

  const std::string requestId = j.get("request_id", "").asString().empty() ? GenerateRequestId() : j.get("request_id", "").asString();
  const std::string t = j.get("type", "").asString();
  if (t == "ping") {
    conn->send(R"({"type":"pong"})");
    return;
  }

  auto channel = MakeChannel();
  auto gameStub = GameService::NewStub(channel);

  if (t == "start_game") {
    if (connSession->role != "host") {
      SendError(conn, "forbidden_not_host");
      return;
    }

    grpc::ClientContext ctx;
    AttachRequestId(ctx, requestId);
    StartGameRequest req;
    req.mutable_room_id()->set_value(connSession->room_id);
    req.mutable_requested_by()->set_value(connSession->user_id);

    StartGameResponse resp;
    spdlog::info("ws_start_game request_id={} pin=- room_id={} player_id=-", requestId, connSession->room_id);
    const auto status = gameStub->StartGame(&ctx, req, &resp);
    if (!status.ok() || resp.has_error()) {
      SendError(conn, "start_game_failed");
      return;
    }

    Json::Value out;
    out["type"] = "start_game_result";
    out["started"] = resp.started();
    conn->send(JsonString(out));
    return;
  }

  if (t == "submit_answer") {
    if (connSession->role != "player" || connSession->player_id.empty()) {
      SendError(conn, "forbidden_not_player");
      return;
    }

    const std::string questionId = j.get("question_id", "").asString();
    const std::string answer = j.get("answer", "").asString();
    if (questionId.empty() || answer.empty()) {
      SendError(conn, "question_id_and_answer_required");
      return;
    }

    grpc::ClientContext ctx;
    AttachRequestId(ctx, requestId);
    SubmitAnswerRequest req;
    req.mutable_room_id()->set_value(connSession->room_id);
    req.mutable_player_id()->set_value(connSession->player_id);
    req.set_question_id(questionId);
    req.set_answer(answer);

    SubmitAnswerResponse resp;
    spdlog::info("ws_submit_answer request_id={} pin=- room_id={} player_id={}", requestId, connSession->room_id, connSession->player_id);
    const auto status = gameStub->SubmitAnswer(&ctx, req, &resp);
    if (!status.ok() || resp.has_error()) {
      SendError(conn, "submit_answer_failed");
      return;
    }

    Json::Value out;
    out["type"] = "submit_answer_result";
    out["accepted"] = resp.accepted();
    out["score_delta"] = resp.score_delta();
    conn->send(JsonString(out));
    return;
  }

  if (t == "get_state") {
    grpc::ClientContext ctx;
    AttachRequestId(ctx, requestId);
    GetRoomStateRequest req;
    req.mutable_room_id()->set_value(connSession->room_id);

    GetRoomStateResponse resp;
    const auto status = gameStub->GetRoomState(&ctx, req, &resp);
    if (!status.ok() || resp.has_error()) {
      SendError(conn, "get_state_failed");
      return;
    }

    Json::Value out;
    out["type"] = "room_state";
    out["room_id"] = resp.room_id().value();
    out["state"] = resp.state();
    Json::Value players(Json::arrayValue);
    for (const auto& p : resp.players()) {
      Json::Value row;
      row["player_id"] = p.player_id().value();
      row["display_name"] = p.display_name();
      row["score"] = p.score();
      players.append(row);
    }
    out["players"] = players;
    if (resp.has_current_question_id()) out["current_question_id"] = resp.current_question_id();
    conn->send(JsonString(out));
    return;
  }

  SendError(conn, "unsupported_message_type");
}

void WsGateway::handleConnectionClosed(const drogon::WebSocketConnectionPtr& conn) {
  std::optional<ConnSession> removed;
  {
    std::lock_guard<std::mutex> lock(g_conn_mu);
    auto it = g_conn_sessions.find(conn.get());
    if (it != g_conn_sessions.end()) {
      removed = it->second;
      g_conn_sessions.erase(it);
    }
  }
  if (!removed) return;
  spdlog::info("ws_disconnected pin=- room_id={} player_id={}", removed->room_id, removed->player_id.empty() ? "-" : removed->player_id);

  std::shared_ptr<RoomHubEntry> entry;
  {
    std::lock_guard<std::mutex> lock(g_hub_mu);
    auto it = g_room_hub.find(removed->room_id);
    if (it == g_room_hub.end()) return;
    entry = it->second;
  }

  {
    std::lock_guard<std::mutex> lock(entry->mu);
    for (auto it = entry->connections.begin(); it != entry->connections.end(); ++it) {
      if (it->get() == conn.get()) {
        entry->connections.erase(it);
        break;
      }
    }
  }

  StopRoomIfEmpty(removed->room_id);
}
