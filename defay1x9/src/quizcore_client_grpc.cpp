#include "quizcore_client.hpp"

#include <grpcpp/grpcpp.h>

#include <chrono>

#include "common.pb.h"
#include "game.grpc.pb.h"
#include "join.grpc.pb.h"

using richcrab::v1::CreateRoomRequest;
using richcrab::v1::CreateRoomResponse;
using richcrab::v1::GameService;
using richcrab::v1::GetRoomStateRequest;
using richcrab::v1::GetRoomStateResponse;
using richcrab::v1::IssueJoinTicketByInviteRequest;
using richcrab::v1::IssueJoinTicketByPinRequest;
using richcrab::v1::IssueJoinTicketResponse;
using richcrab::v1::JoinRoomRequest;
using richcrab::v1::JoinRoomResponse;
using richcrab::v1::JoinService;
using richcrab::v1::StartGameRequest;
using richcrab::v1::StartGameResponse;

class QuizCoreClientGrpc::Impl final {
public:
  Impl(const std::string& gameAddr,
       const std::string& joinAddr,
       int deadlineMsCreateRoom,
       int deadlineMsIssueJoinTicket,
       int deadlineMsJoinRoom,
       int deadlineMsStartGame,
       int deadlineMsGetRoomState)
      : deadline_ms_create_room(deadlineMsCreateRoom),
        deadline_ms_issue_join_ticket(deadlineMsIssueJoinTicket),
        deadline_ms_join_room(deadlineMsJoinRoom),
        deadline_ms_start_game(deadlineMsStartGame),
        deadline_ms_get_room_state(deadlineMsGetRoomState) {
    auto gameChannel = grpc::CreateChannel(gameAddr, grpc::InsecureChannelCredentials());
    auto joinChannel = grpc::CreateChannel(joinAddr, grpc::InsecureChannelCredentials());
    game = GameService::NewStub(gameChannel);
    join = JoinService::NewStub(joinChannel);
  }

  std::unique_ptr<GameService::Stub> game;
  std::unique_ptr<JoinService::Stub> join;
  int deadline_ms_create_room;
  int deadline_ms_issue_join_ticket;
  int deadline_ms_join_room;
  int deadline_ms_start_game;
  int deadline_ms_get_room_state;
};

QuizCoreClientGrpc::QuizCoreClientGrpc(const std::string& gameAddr,
                                       const std::string& joinAddr,
                                       int deadlineMsCreateRoom,
                                       int deadlineMsIssueJoinTicket,
                                       int deadlineMsJoinRoom,
                                       int deadlineMsStartGame,
                                       int deadlineMsGetRoomState)
    : impl_(std::make_unique<Impl>(gameAddr,
                                   joinAddr,
                                   deadlineMsCreateRoom,
                                   deadlineMsIssueJoinTicket,
                                   deadlineMsJoinRoom,
                                   deadlineMsStartGame,
                                   deadlineMsGetRoomState)) {}

QuizCoreClientGrpc::~QuizCoreClientGrpc() = default;

std::optional<QuizCoreCreateRoomResult> QuizCoreClientGrpc::createRoom(const std::string& ownerUserId,
                                                                        const std::string& quizId,
                                                                        const std::string& title) {
  grpc::ClientContext ctx;
  ctx.set_deadline(std::chrono::system_clock::now() +
                   std::chrono::milliseconds(impl_->deadline_ms_create_room));
  CreateRoomRequest req;
  req.mutable_owner_user_id()->set_value(ownerUserId);
  req.mutable_quiz_id()->set_value(quizId);
  req.set_title(title);

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
  ticketCtx.set_deadline(std::chrono::system_clock::now() +
                         std::chrono::milliseconds(impl_->deadline_ms_issue_join_ticket));
  IssueJoinTicketByPinRequest ticketReq;
  ticketReq.set_pin(pin);
  ticketReq.set_display_name(displayName);

  IssueJoinTicketResponse ticketResp;
  const auto ticketStatus = impl_->join->IssueJoinTicketByPin(&ticketCtx, ticketReq, &ticketResp);
  if (!ticketStatus.ok() || ticketResp.has_error() || !ticketResp.has_ticket()) return std::nullopt;

  grpc::ClientContext joinCtx;
  joinCtx.set_deadline(std::chrono::system_clock::now() +
                       std::chrono::milliseconds(impl_->deadline_ms_join_room));
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


std::optional<QuizCoreJoinRoomResult> QuizCoreClientGrpc::joinRoomByInvite(const std::string& inviteToken,
                                                                            const std::string& displayName) {
  grpc::ClientContext ticketCtx;
  ticketCtx.set_deadline(std::chrono::system_clock::now() +
                         std::chrono::milliseconds(impl_->deadline_ms_issue_join_ticket));
  IssueJoinTicketByInviteRequest ticketReq;
  ticketReq.set_invite_token(inviteToken);
  ticketReq.set_display_name(displayName);

  IssueJoinTicketResponse ticketResp;
  const auto ticketStatus = impl_->join->IssueJoinTicketByInvite(&ticketCtx, ticketReq, &ticketResp);
  if (!ticketStatus.ok() || ticketResp.has_error() || !ticketResp.has_ticket()) return std::nullopt;

  grpc::ClientContext joinCtx;
  joinCtx.set_deadline(std::chrono::system_clock::now() +
                       std::chrono::milliseconds(impl_->deadline_ms_join_room));
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
  ctx.set_deadline(std::chrono::system_clock::now() +
                   std::chrono::milliseconds(impl_->deadline_ms_start_game));
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
  ctx.set_deadline(std::chrono::system_clock::now() +
                   std::chrono::milliseconds(impl_->deadline_ms_get_room_state));
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
