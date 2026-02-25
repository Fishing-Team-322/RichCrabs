#include "quizcore_client.hpp"

#include <grpcpp/grpcpp.h>

#include "common.pb.h"
#include "game.grpc.pb.h"
#include "join.grpc.pb.h"

using richcrab::v1::CreateRoomRequest;
using richcrab::v1::CreateRoomResponse;
using richcrab::v1::GameService;
using richcrab::v1::GetRoomStateRequest;
using richcrab::v1::GetRoomStateResponse;
using richcrab::v1::IssueJoinTicketByPinRequest;
using richcrab::v1::IssueJoinTicketResponse;
using richcrab::v1::JoinRoomRequest;
using richcrab::v1::JoinRoomResponse;
using richcrab::v1::JoinService;
using richcrab::v1::StartGameRequest;
using richcrab::v1::StartGameResponse;

class QuizCoreClientGrpc::Impl final {
public:
  explicit Impl(const std::string& target) {
    auto channel = grpc::CreateChannel(target, grpc::InsecureChannelCredentials());
    game = GameService::NewStub(channel);
    join = JoinService::NewStub(channel);
  }

  std::unique_ptr<GameService::Stub> game;
  std::unique_ptr<JoinService::Stub> join;
};

QuizCoreClientGrpc::QuizCoreClientGrpc(const std::string& target)
    : impl_(std::make_unique<Impl>(target)) {}

QuizCoreClientGrpc::~QuizCoreClientGrpc() = default;

std::optional<QuizCoreCreateRoomResult> QuizCoreClientGrpc::createRoom(const std::string& topic,
                                                                        int questionsPerTeam) {
  grpc::ClientContext ctx;
  CreateRoomRequest req;
  req.mutable_owner_user_id()->set_value("gw-owner");
  req.mutable_quiz_id()->set_value(topic);
  req.set_title(topic + " (qpt=" + std::to_string(questionsPerTeam) + ")");

  CreateRoomResponse resp;
  const auto status = impl_->game->CreateRoom(&ctx, req, &resp);
  if (!status.ok() || resp.has_error()) return std::nullopt;

  QuizCoreCreateRoomResult out;
  out.room_id = resp.room_id().value();
  out.pin = resp.pin();
  out.invite_token = resp.invite_token();
  return out;
}

std::optional<QuizCoreJoinRoomResult> QuizCoreClientGrpc::joinRoomByPin(const std::string& pin,
                                                                         const std::string& displayName) {
  grpc::ClientContext ticketCtx;
  IssueJoinTicketByPinRequest ticketReq;
  ticketReq.set_pin(pin);
  ticketReq.set_display_name(displayName);

  IssueJoinTicketResponse ticketResp;
  const auto ticketStatus = impl_->join->IssueJoinTicketByPin(&ticketCtx, ticketReq, &ticketResp);
  if (!ticketStatus.ok() || ticketResp.has_error() || !ticketResp.has_ticket()) return std::nullopt;

  grpc::ClientContext joinCtx;
  JoinRoomRequest joinReq;
  joinReq.set_join_ticket(ticketResp.ticket().token());

  JoinRoomResponse joinResp;
  const auto joinStatus = impl_->game->JoinRoom(&joinCtx, joinReq, &joinResp);
  if (!joinStatus.ok() || joinResp.has_error()) return std::nullopt;

  QuizCoreJoinRoomResult out;
  out.room_id = ticketResp.ticket().room_id().value();
  out.join_ticket = ticketResp.ticket().token();
  out.player_id = joinResp.player_id().value();
  return out;
}

bool QuizCoreClientGrpc::startGame(const std::string& roomId, const std::string& requestedByUserId) {
  grpc::ClientContext ctx;
  StartGameRequest req;
  req.mutable_room_id()->set_value(roomId);
  req.mutable_requested_by()->set_value(requestedByUserId);

  StartGameResponse resp;
  const auto status = impl_->game->StartGame(&ctx, req, &resp);
  if (!status.ok() || resp.has_error()) return false;
  return resp.started();
}

std::optional<QuizCoreRoomState> QuizCoreClientGrpc::getRoomState(const std::string& roomId) {
  grpc::ClientContext ctx;
  GetRoomStateRequest req;
  req.mutable_room_id()->set_value(roomId);

  GetRoomStateResponse resp;
  const auto status = impl_->game->GetRoomState(&ctx, req, &resp);
  if (!status.ok() || resp.has_error()) return std::nullopt;

  QuizCoreRoomState out;
  out.room_id = resp.room_id().value();
  out.state = resp.state();
  for (const auto& p : resp.players()) {
    QuizCorePlayerState ps;
    ps.player_id = p.player_id().value();
    ps.display_name = p.display_name();
    ps.score = p.score();
    out.players.push_back(std::move(ps));
  }
  if (resp.has_current_question_id()) out.current_question_id = resp.current_question_id();
  return out;
}
