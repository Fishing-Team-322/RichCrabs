#include "quizcore_client.hpp"

#include <grpcpp/grpcpp.h>

#include <chrono>
#include <cctype>
#include <utility>

#include "bot.grpc.pb.h"
#include "common.pb.h"
#include "game.grpc.pb.h"
#include "join.grpc.pb.h"
#include "quiz.grpc.pb.h"
#include "richcrab.grpc.pb.h"

using richcrab::v1::BotService;
using richcrab::v1::CreateRoomRequest;
using richcrab::v1::CreateRoomResponse;
using richcrab::v1::GameService;
using richcrab::v1::GetBotStatusRequest;
using richcrab::v1::GetBotStatusResponse;
using richcrab::v1::GetRoomStateRequest;
using richcrab::v1::GetRoomStateResponse;
using richcrab::v1::IssueJoinTicketByInviteRequest;
using richcrab::v1::IssueJoinTicketByPinRequest;
using richcrab::v1::IssueJoinTicketResponse;
using richcrab::v1::JoinRoomRequest;
using richcrab::v1::JoinRoomResponse;
using richcrab::v1::JoinService;
using richcrab::v1::KickPlayerRequest;
using richcrab::v1::KickPlayerResponse;
using richcrab::v1::LeaveRoomRequest;
using richcrab::v1::LeaveRoomResponse;
using richcrab::v1::ListBotsRequest;
using richcrab::v1::ListBotsResponse;
using richcrab::v1::ListQuizzesRequest;
using richcrab::v1::ListQuizzesResponse;
using richcrab::v1::NextQuestionRequest;
using richcrab::v1::NextQuestionResponse;
using richcrab::v1::PauseGameRequest;
using richcrab::v1::PauseGameResponse;
using richcrab::v1::RegisterBotRequest;
using richcrab::v1::RegisterBotResponse;
using richcrab::v1::RemoveBotRequest;
using richcrab::v1::RemoveBotResponse;
using richcrab::v1::ResumeGameRequest;
using richcrab::v1::ResumeGameResponse;
using richcrab::v1::StartGameRequest;
using richcrab::v1::StartGameResponse;
using richcrab::v1::SubmitAnswerRequest;
using richcrab::v1::SubmitAnswerResponse;
using richcrab::v1::CreateQuizRequest;
using richcrab::v1::CreateQuizResponse;
using richcrab::v1::GetQuizRequest;
using richcrab::v1::GetQuizResponse;
using richcrab::v1::PublishQuizRequest;
using richcrab::v1::PublishQuizResponse;
using richcrab::v1::Quiz;
using richcrab::v1::QuizQuestion;
using richcrab::v1::QuizService;
using richcrab::v1::StartAiQuizJobRequest;
using richcrab::v1::StartAiQuizJobResponse;
using richcrab::v1::UpdateQuizRequest;
using richcrab::v1::UpdateQuizResponse;
using richcrab::v1::Health;
using richcrab::v1::Error;
using richcrab::v1::PingRequest;
using richcrab::v1::PingResponse;

namespace {
QuizCoreRpcStatus mapStatus(const grpc::Status& status) {
  if (status.ok()) return QuizCoreRpcStatus::kOk;
  switch (status.error_code()) {
    case grpc::StatusCode::PERMISSION_DENIED: return QuizCoreRpcStatus::kPermissionDenied;
    case grpc::StatusCode::INVALID_ARGUMENT: return QuizCoreRpcStatus::kInvalidArgument;
    case grpc::StatusCode::NOT_FOUND: return QuizCoreRpcStatus::kNotFound;
    case grpc::StatusCode::FAILED_PRECONDITION: return QuizCoreRpcStatus::kFailedPrecondition;
    case grpc::StatusCode::DEADLINE_EXCEEDED: return QuizCoreRpcStatus::kDeadlineExceeded;
    case grpc::StatusCode::UNAVAILABLE: return QuizCoreRpcStatus::kUnavailable;
    default: return QuizCoreRpcStatus::kUnknown;
  }
}

QuizCoreRpcStatus mapProtoErrorCode(std::string code) {
  for (char& ch : code) {
    if (ch == '.') ch = '_';
    ch = static_cast<char>(std::toupper(static_cast<unsigned char>(ch)));
  }

  if (code == "INVALID_ARGUMENT") return QuizCoreRpcStatus::kInvalidArgument;
  if (code == "NOT_FOUND") return QuizCoreRpcStatus::kNotFound;
  if (code == "FAILED_PRECONDITION") return QuizCoreRpcStatus::kFailedPrecondition;
  if (code == "PERMISSION_DENIED") return QuizCoreRpcStatus::kPermissionDenied;
  if (code == "DEADLINE_EXCEEDED") return QuizCoreRpcStatus::kDeadlineExceeded;
  if (code == "UNAVAILABLE") return QuizCoreRpcStatus::kUnavailable;
  if (code == "OK") return QuizCoreRpcStatus::kOk;
  return QuizCoreRpcStatus::kUnknown;
}

template <typename TResult>
void applyProtoErrorStatus(TResult& out, const Error& error) {
  out.error_code = error.code();
  out.error_message = error.message();
  out.status = mapProtoErrorCode(error.code());
  if (out.status == QuizCoreRpcStatus::kUnknown) out.status = QuizCoreRpcStatus::kUnavailable;
}

QuizCoreBot mapBot(const richcrab::v1::Bot& bot) {
  QuizCoreBot out;
  out.bot_id = bot.bot_id().value();
  out.name = bot.name();
  out.version = bot.version();
  out.status = bot.status();
  if (bot.has_registered_at()) out.registered_at = bot.registered_at().seconds();
  return out;
}

QuizCoreQuizQuestion mapQuizQuestion(const QuizQuestion& q) {
  QuizCoreQuizQuestion out;
  out.id = q.id();
  out.text = q.text();
  for (const auto& option : q.options()) out.options.push_back(option);
  if (q.has_correct_option_index()) out.correct_option_index = q.correct_option_index();
  return out;
}

QuizCoreQuiz mapQuiz(const Quiz& quiz) {
  QuizCoreQuiz out;
  out.quiz_id = quiz.quiz_id().value();
  out.owner_user_id = quiz.owner_user_id().value();
  out.title = quiz.title();
  out.description = quiz.description();
  for (const auto& question : quiz.questions()) out.questions.push_back(mapQuizQuestion(question));
  return out;
}

void setQuizQuestion(const QuizCoreQuizQuestion& input, QuizQuestion* output) {
  output->set_id(input.id);
  output->set_text(input.text);
  for (const auto& option : input.options) output->add_options(option);
  if (input.correct_option_index.has_value()) output->set_correct_option_index(*input.correct_option_index);
}

void setQuiz(const QuizCoreQuiz& input, Quiz* output) {
  output->mutable_quiz_id()->set_value(input.quiz_id);
  output->mutable_owner_user_id()->set_value(input.owner_user_id);
  output->set_title(input.title);
  output->set_description(input.description);
  for (const auto& question : input.questions) setQuizQuestion(question, output->add_questions());
}

void attachUserId(grpc::ClientContext& ctx, const std::string& userId) {
  ctx.AddMetadata("x-user-id", userId);
}

void attachRequestId(grpc::ClientContext& ctx, const std::string& requestId) {
  if (!requestId.empty()) ctx.AddMetadata("x-request-id", requestId);
}
}

class QuizCoreClientGrpc::Impl final {
public:
  Impl(const std::string& gameAddr,
       const std::string& joinAddr,
       const std::string& quizAddr,
       const std::string& botAddr,
       int deadlineMsCreateRoom,
       int deadlineMsIssueJoinTicket,
       int deadlineMsJoinRoom,
       int deadlineMsStartGame,
       int deadlineMsPauseGame,
       int deadlineMsResumeGame,
       int deadlineMsNextQuestion,
       int deadlineMsSubmitAnswer,
       int deadlineMsGetRoomState,
       int deadlineMsCreateQuiz,
       int deadlineMsListQuizzes,
       int deadlineMsGetQuiz,
       int deadlineMsUpdateQuiz,
       int deadlineMsPublishQuiz,
       int deadlineMsStartAiQuizJob)
      : deadline_ms_create_room(deadlineMsCreateRoom),
        deadline_ms_issue_join_ticket(deadlineMsIssueJoinTicket),
        deadline_ms_join_room(deadlineMsJoinRoom),
        deadline_ms_start_game(deadlineMsStartGame),
        deadline_ms_pause_game(deadlineMsPauseGame),
        deadline_ms_resume_game(deadlineMsResumeGame),
        deadline_ms_next_question(deadlineMsNextQuestion),
        deadline_ms_submit_answer(deadlineMsSubmitAnswer),
        deadline_ms_get_room_state(deadlineMsGetRoomState),
        deadline_ms_create_quiz(deadlineMsCreateQuiz),
        deadline_ms_list_quizzes(deadlineMsListQuizzes),
        deadline_ms_get_quiz(deadlineMsGetQuiz),
        deadline_ms_update_quiz(deadlineMsUpdateQuiz),
        deadline_ms_publish_quiz(deadlineMsPublishQuiz),
        deadline_ms_start_ai_quiz_job(deadlineMsStartAiQuizJob) {
    auto gameChannel = grpc::CreateChannel(gameAddr, grpc::InsecureChannelCredentials());
    auto joinChannel = grpc::CreateChannel(joinAddr, grpc::InsecureChannelCredentials());
    auto quizChannel = grpc::CreateChannel(quizAddr, grpc::InsecureChannelCredentials());
    auto botChannel = grpc::CreateChannel(botAddr, grpc::InsecureChannelCredentials());
    game = GameService::NewStub(gameChannel);
    join = JoinService::NewStub(joinChannel);
    quiz = QuizService::NewStub(quizChannel);
    bot = BotService::NewStub(botChannel);
    health = Health::NewStub(gameChannel);
  }

  std::unique_ptr<GameService::Stub> game;
  std::unique_ptr<JoinService::Stub> join;
  std::unique_ptr<QuizService::Stub> quiz;
  std::unique_ptr<BotService::Stub> bot;
  std::unique_ptr<Health::Stub> health;
  int deadline_ms_create_room;
  int deadline_ms_issue_join_ticket;
  int deadline_ms_join_room;
  int deadline_ms_start_game;
  int deadline_ms_pause_game;
  int deadline_ms_resume_game;
  int deadline_ms_next_question;
  int deadline_ms_submit_answer;
  int deadline_ms_get_room_state;
  int deadline_ms_create_quiz;
  int deadline_ms_list_quizzes;
  int deadline_ms_get_quiz;
  int deadline_ms_update_quiz;
  int deadline_ms_publish_quiz;
  int deadline_ms_start_ai_quiz_job;
};

QuizCoreClientGrpc::QuizCoreClientGrpc(const std::string& gameAddr,
                                       const std::string& joinAddr,
                                       const std::string& quizAddr,
                                       const std::string& botAddr,
                                       int deadlineMsCreateRoom,
                                       int deadlineMsIssueJoinTicket,
                                       int deadlineMsJoinRoom,
                                       int deadlineMsStartGame,
                                       int deadlineMsPauseGame,
                                       int deadlineMsResumeGame,
                                       int deadlineMsNextQuestion,
                                       int deadlineMsSubmitAnswer,
                                       int deadlineMsGetRoomState,
                                       int deadlineMsCreateQuiz,
                                       int deadlineMsListQuizzes,
                                       int deadlineMsGetQuiz,
                                       int deadlineMsUpdateQuiz,
                                       int deadlineMsPublishQuiz,
                                       int deadlineMsStartAiQuizJob)
    : impl_(std::make_unique<Impl>(gameAddr,
                                   joinAddr,
                                   quizAddr,
                                   botAddr,
                                   deadlineMsCreateRoom,
                                   deadlineMsIssueJoinTicket,
                                   deadlineMsJoinRoom,
                                   deadlineMsStartGame,
                                   deadlineMsPauseGame,
                                   deadlineMsResumeGame,
                                   deadlineMsNextQuestion,
                                   deadlineMsSubmitAnswer,
                                   deadlineMsGetRoomState,
                                   deadlineMsCreateQuiz,
                                   deadlineMsListQuizzes,
                                   deadlineMsGetQuiz,
                                   deadlineMsUpdateQuiz,
                                   deadlineMsPublishQuiz,
                                   deadlineMsStartAiQuizJob)) {}

QuizCoreClientGrpc::~QuizCoreClientGrpc() = default;

std::optional<QuizCoreCreateRoomResult> QuizCoreClientGrpc::createRoom(const std::string& ownerUserId,
                                                                        const std::string& quizId,
                                                                        const std::string& title,
                                                                        const std::string& requestId) {
  grpc::ClientContext ctx;
  attachRequestId(ctx, requestId);
  ctx.set_deadline(std::chrono::system_clock::now() +
                   std::chrono::milliseconds(impl_->deadline_ms_create_room));
  CreateRoomRequest req;
  req.mutable_owner_user_id()->set_value(ownerUserId);
  req.mutable_quiz_id()->set_value(quizId);
  req.set_title(title);

  CreateRoomResponse resp;
  const auto status = impl_->game->CreateRoom(&ctx, req, &resp);
  QuizCoreCreateRoomResult out;
  out.status = mapStatus(status);
  if (!status.ok()) return out;
  if (resp.has_error()) {
    applyProtoErrorStatus(out, resp.error());
    return out;
  }

  out.status = QuizCoreRpcStatus::kOk;
  out.room_id = resp.room_id().value();
  out.pin = resp.pin();
  out.invite_token = resp.invite_token();
  return out;
}

std::optional<QuizCoreJoinRoomResult> QuizCoreClientGrpc::joinRoomByPin(const std::string& pin,
                                                                         const std::string& displayName,
                                                                         const std::string& requestId) {
  grpc::ClientContext ticketCtx;
  attachRequestId(ticketCtx, requestId);
  ticketCtx.set_deadline(std::chrono::system_clock::now() +
                         std::chrono::milliseconds(impl_->deadline_ms_issue_join_ticket));
  IssueJoinTicketByPinRequest ticketReq;
  ticketReq.set_pin(pin);
  ticketReq.set_display_name(displayName);

  IssueJoinTicketResponse ticketResp;
  const auto ticketStatus = impl_->join->IssueJoinTicketByPin(&ticketCtx, ticketReq, &ticketResp);
  if (!ticketStatus.ok()) {
    QuizCoreJoinRoomResult out;
    out.status = mapStatus(ticketStatus);
    return out;
  }
  if (ticketResp.has_error() || !ticketResp.has_ticket()) {
    QuizCoreJoinRoomResult out;
    if (ticketResp.has_error()) {
      applyProtoErrorStatus(out, ticketResp.error());
    } else {
      out.status = QuizCoreRpcStatus::kUnavailable;
    }
    return out;
  }

  grpc::ClientContext joinCtx;
  attachRequestId(joinCtx, requestId);
  joinCtx.set_deadline(std::chrono::system_clock::now() +
                       std::chrono::milliseconds(impl_->deadline_ms_join_room));
  JoinRoomRequest joinReq;
  joinReq.set_join_ticket(ticketResp.ticket().token());

  JoinRoomResponse joinResp;
  const auto joinStatus = impl_->game->JoinRoom(&joinCtx, joinReq, &joinResp);
  QuizCoreJoinRoomResult out;
  out.status = mapStatus(joinStatus);
  if (!joinStatus.ok()) return out;
  if (joinResp.has_error()) {
    applyProtoErrorStatus(out, joinResp.error());
    return out;
  }

  out.status = QuizCoreRpcStatus::kOk;
  out.room_id = ticketResp.ticket().room_id().value();
  out.join_ticket = ticketResp.ticket().token();
  out.player_id = joinResp.player_id().value();
  return out;
}

std::optional<QuizCoreJoinRoomResult> QuizCoreClientGrpc::joinRoomByInvite(const std::string& inviteToken,
                                                                            const std::string& displayName,
                                                                            const std::string& requestId) {
  grpc::ClientContext ticketCtx;
  attachRequestId(ticketCtx, requestId);
  ticketCtx.set_deadline(std::chrono::system_clock::now() +
                         std::chrono::milliseconds(impl_->deadline_ms_issue_join_ticket));
  IssueJoinTicketByInviteRequest ticketReq;
  ticketReq.set_invite_token(inviteToken);
  ticketReq.set_display_name(displayName);

  IssueJoinTicketResponse ticketResp;
  const auto ticketStatus = impl_->join->IssueJoinTicketByInvite(&ticketCtx, ticketReq, &ticketResp);
  if (!ticketStatus.ok()) {
    QuizCoreJoinRoomResult out;
    out.status = mapStatus(ticketStatus);
    return out;
  }
  if (ticketResp.has_error() || !ticketResp.has_ticket()) {
    QuizCoreJoinRoomResult out;
    if (ticketResp.has_error()) {
      applyProtoErrorStatus(out, ticketResp.error());
    } else {
      out.status = QuizCoreRpcStatus::kUnavailable;
    }
    return out;
  }

  grpc::ClientContext joinCtx;
  attachRequestId(joinCtx, requestId);
  joinCtx.set_deadline(std::chrono::system_clock::now() +
                       std::chrono::milliseconds(impl_->deadline_ms_join_room));
  JoinRoomRequest joinReq;
  joinReq.set_join_ticket(ticketResp.ticket().token());

  JoinRoomResponse joinResp;
  const auto joinStatus = impl_->game->JoinRoom(&joinCtx, joinReq, &joinResp);
  QuizCoreJoinRoomResult out;
  out.status = mapStatus(joinStatus);
  if (!joinStatus.ok()) return out;
  if (joinResp.has_error()) {
    applyProtoErrorStatus(out, joinResp.error());
    return out;
  }

  out.status = QuizCoreRpcStatus::kOk;
  out.room_id = ticketResp.ticket().room_id().value();
  out.join_ticket = ticketResp.ticket().token();
  out.player_id = joinResp.player_id().value();
  return out;
}

QuizCoreStartGameResult QuizCoreClientGrpc::startGame(const std::string& roomId,
                                                      const std::string& requestedByUserId,
                                                      const std::string& requestId) {
  grpc::ClientContext ctx;
  attachRequestId(ctx, requestId);
  ctx.set_deadline(std::chrono::system_clock::now() +
                   std::chrono::milliseconds(impl_->deadline_ms_start_game));
  StartGameRequest req;
  req.mutable_room_id()->set_value(roomId);
  req.mutable_requested_by()->set_value(requestedByUserId);

  StartGameResponse resp;
  const auto status = impl_->game->StartGame(&ctx, req, &resp);
  QuizCoreStartGameResult out;
  out.status = mapStatus(status);
  if (!status.ok()) return out;
  if (resp.has_error()) {
    applyProtoErrorStatus(out, resp.error());
    return out;
  }
  out.status = QuizCoreRpcStatus::kOk;
  out.started = resp.started();
  return out;
}

QuizCoreLeaveRoomResult QuizCoreClientGrpc::leaveRoom(const std::string& roomId,
                                                      const std::string& playerId,
                                                      const std::string& requestId) {
  grpc::ClientContext ctx;
  attachRequestId(ctx, requestId);
  ctx.set_deadline(std::chrono::system_clock::now() +
                   std::chrono::milliseconds(impl_->deadline_ms_start_game));
  LeaveRoomRequest req;
  req.mutable_room_id()->set_value(roomId);
  req.mutable_player_id()->set_value(playerId);

  LeaveRoomResponse resp;
  const auto status = impl_->game->LeaveRoom(&ctx, req, &resp);

  QuizCoreLeaveRoomResult out;
  out.status = mapStatus(status);
  if (!status.ok() || resp.has_error()) return out;
  out.left = resp.left();
  return out;
}

QuizCoreKickPlayerResult QuizCoreClientGrpc::kickPlayer(const std::string& roomId,
                                                        const std::string& requestedByUserId,
                                                        const std::string& playerId,
                                                        const std::string& requestId) {
  grpc::ClientContext ctx;
  attachRequestId(ctx, requestId);
  ctx.set_deadline(std::chrono::system_clock::now() +
                   std::chrono::milliseconds(impl_->deadline_ms_start_game));
  KickPlayerRequest req;
  req.mutable_room_id()->set_value(roomId);
  req.mutable_requested_by()->set_value(requestedByUserId);
  req.mutable_player_id()->set_value(playerId);

  KickPlayerResponse resp;
  const auto status = impl_->game->KickPlayer(&ctx, req, &resp);

  QuizCoreKickPlayerResult out;
  out.status = mapStatus(status);
  if (!status.ok() || resp.has_error()) return out;
  out.kicked = resp.kicked();
  return out;
}

QuizCorePauseGameResult QuizCoreClientGrpc::pauseGame(const std::string& roomId,
                                                      const std::string& requestedByUserId,
                                                      const std::string& requestId) {
  grpc::ClientContext ctx;
  attachRequestId(ctx, requestId);
  ctx.set_deadline(std::chrono::system_clock::now() +
                   std::chrono::milliseconds(impl_->deadline_ms_pause_game));
  PauseGameRequest req;
  req.mutable_room_id()->set_value(roomId);
  req.mutable_requested_by()->set_value(requestedByUserId);

  PauseGameResponse resp;
  const auto status = impl_->game->PauseGame(&ctx, req, &resp);

  QuizCorePauseGameResult out;
  out.status = mapStatus(status);
  if (!status.ok() || resp.has_error()) return out;
  out.paused = resp.paused();
  return out;
}

QuizCoreResumeGameResult QuizCoreClientGrpc::resumeGame(const std::string& roomId,
                                                        const std::string& requestedByUserId,
                                                        const std::string& requestId) {
  grpc::ClientContext ctx;
  attachRequestId(ctx, requestId);
  ctx.set_deadline(std::chrono::system_clock::now() +
                   std::chrono::milliseconds(impl_->deadline_ms_resume_game));
  ResumeGameRequest req;
  req.mutable_room_id()->set_value(roomId);
  req.mutable_requested_by()->set_value(requestedByUserId);

  ResumeGameResponse resp;
  const auto status = impl_->game->ResumeGame(&ctx, req, &resp);

  QuizCoreResumeGameResult out;
  out.status = mapStatus(status);
  if (!status.ok() || resp.has_error()) return out;
  out.resumed = resp.resumed();
  return out;
}

QuizCoreNextQuestionResult QuizCoreClientGrpc::nextQuestion(const std::string& roomId,
                                                            const std::string& requestedByUserId,
                                                            const std::string& requestId) {
  grpc::ClientContext ctx;
  attachRequestId(ctx, requestId);
  ctx.set_deadline(std::chrono::system_clock::now() +
                   std::chrono::milliseconds(impl_->deadline_ms_next_question));
  NextQuestionRequest req;
  req.mutable_room_id()->set_value(roomId);
  req.mutable_requested_by()->set_value(requestedByUserId);

  NextQuestionResponse resp;
  const auto status = impl_->game->NextQuestion(&ctx, req, &resp);

  QuizCoreNextQuestionResult out;
  out.status = mapStatus(status);
  if (!status.ok() || resp.has_error()) return out;
  out.advanced = resp.advanced();
  return out;
}

QuizCoreSubmitAnswerResult QuizCoreClientGrpc::submitAnswer(const std::string& roomId,
                                                            const std::string& playerId,
                                                            const std::string& questionId,
                                                            const std::string& answer,
                                                            const std::string& requestId) {
  grpc::ClientContext ctx;
  attachRequestId(ctx, requestId);
  ctx.set_deadline(std::chrono::system_clock::now() +
                   std::chrono::milliseconds(impl_->deadline_ms_submit_answer));
  SubmitAnswerRequest req;
  req.mutable_room_id()->set_value(roomId);
  req.mutable_player_id()->set_value(playerId);
  req.set_question_id(questionId);
  req.set_answer(answer);

  SubmitAnswerResponse resp;
  const auto status = impl_->game->SubmitAnswer(&ctx, req, &resp);

  QuizCoreSubmitAnswerResult out;
  out.status = mapStatus(status);
  if (!status.ok() || resp.has_error()) return out;
  out.accepted = resp.accepted();
  out.score_delta = resp.score_delta();
  return out;
}

QuizCoreGetRoomStateResult QuizCoreClientGrpc::getRoomState(const std::string& roomId,
                                                            const std::string& requestId) {
  grpc::ClientContext ctx;
  attachRequestId(ctx, requestId);
  ctx.set_deadline(std::chrono::system_clock::now() +
                   std::chrono::milliseconds(impl_->deadline_ms_get_room_state));
  GetRoomStateRequest req;
  req.mutable_room_id()->set_value(roomId);

  GetRoomStateResponse resp;
  const auto status = impl_->game->GetRoomState(&ctx, req, &resp);
  QuizCoreGetRoomStateResult out;
  out.status = mapStatus(status);
  if (!status.ok()) return out;
  if (resp.has_error()) {
    applyProtoErrorStatus(out, resp.error());
    return out;
  }

  QuizCoreRoomState roomState;
  roomState.room_id = resp.room_id().value();
  roomState.state = resp.state();
  for (const auto& p : resp.players()) {
    QuizCorePlayerState ps;
    ps.player_id = p.player_id().value();
    ps.display_name = p.display_name();
    ps.score = p.score();
    roomState.players.push_back(std::move(ps));
  }
  if (resp.has_current_question_id()) roomState.current_question_id = resp.current_question_id();
  out.status = QuizCoreRpcStatus::kOk;
  out.room_state = std::move(roomState);
  return out;
}

QuizCoreRegisterBotResult QuizCoreClientGrpc::registerBot(const std::string& userId,
                                                          const std::string& name,
                                                          const std::string& version,
                                                          const std::string& endpoint,
                                                          const std::string& requestId) {
  grpc::ClientContext ctx;
  attachUserId(ctx, userId);
  attachRequestId(ctx, requestId);
  RegisterBotRequest req;
  req.set_name(name);
  req.set_version(version);
  req.set_endpoint(endpoint);

  RegisterBotResponse resp;
  const auto status = impl_->bot->RegisterBot(&ctx, req, &resp);

  QuizCoreRegisterBotResult out;
  out.status = mapStatus(status);
  if (!status.ok()) return out;
  if (resp.has_error()) {
    applyProtoErrorStatus(out, resp.error());
    return out;
  }
  if (!resp.has_bot()) return out;
  out.status = QuizCoreRpcStatus::kOk;
  out.bot = mapBot(resp.bot());
  return out;
}

QuizCoreListBotsResult QuizCoreClientGrpc::listBots(const std::string& userId,
                                                    const std::string& requestId) {
  grpc::ClientContext ctx;
  attachUserId(ctx, userId);
  attachRequestId(ctx, requestId);
  ListBotsRequest req;

  ListBotsResponse resp;
  const auto status = impl_->bot->ListBots(&ctx, req, &resp);

  QuizCoreListBotsResult out;
  out.status = mapStatus(status);
  if (!status.ok()) return out;
  if (resp.has_error()) {
    applyProtoErrorStatus(out, resp.error());
    return out;
  }
  out.status = QuizCoreRpcStatus::kOk;
  for (const auto& bot : resp.bots()) out.bots.push_back(mapBot(bot));
  return out;
}

QuizCoreRemoveBotResult QuizCoreClientGrpc::removeBot(const std::string& userId,
                                                      const std::string& botId,
                                                      const std::string& requestId) {
  grpc::ClientContext ctx;
  attachUserId(ctx, userId);
  attachRequestId(ctx, requestId);
  RemoveBotRequest req;
  req.mutable_bot_id()->set_value(botId);

  RemoveBotResponse resp;
  const auto status = impl_->bot->RemoveBot(&ctx, req, &resp);

  QuizCoreRemoveBotResult out;
  out.status = mapStatus(status);
  if (!status.ok()) return out;
  if (resp.has_error()) {
    applyProtoErrorStatus(out, resp.error());
    return out;
  }
  out.status = QuizCoreRpcStatus::kOk;
  out.removed = resp.removed();
  return out;
}

QuizCoreGetBotResult QuizCoreClientGrpc::getBotStatus(const std::string& userId,
                                                      const std::string& botId,
                                                      const std::string& requestId) {
  grpc::ClientContext ctx;
  attachUserId(ctx, userId);
  attachRequestId(ctx, requestId);
  GetBotStatusRequest req;
  req.mutable_bot_id()->set_value(botId);

  GetBotStatusResponse resp;
  const auto status = impl_->bot->GetBotStatus(&ctx, req, &resp);

  QuizCoreGetBotResult out;
  out.status = mapStatus(status);
  if (!status.ok()) return out;
  if (resp.has_error()) {
    applyProtoErrorStatus(out, resp.error());
    return out;
  }
  if (!resp.has_bot()) return out;
  out.status = QuizCoreRpcStatus::kOk;
  out.bot = mapBot(resp.bot());
  return out;
}

QuizCoreCreateQuizResult QuizCoreClientGrpc::createQuiz(const std::string& ownerUserId,
                                                            const std::string& title,
                                                            const std::string& description,
                                                            const std::vector<QuizCoreQuizQuestion>& questions,
                                                            const std::string& requestId) {
  grpc::ClientContext ctx;
  attachRequestId(ctx, requestId);
  ctx.set_deadline(std::chrono::system_clock::now() +
                   std::chrono::milliseconds(impl_->deadline_ms_create_quiz));

  CreateQuizRequest req;
  req.mutable_owner_user_id()->set_value(ownerUserId);
  req.set_title(title);
  req.set_description(description);
  for (const auto& question : questions) setQuizQuestion(question, req.add_questions());

  CreateQuizResponse resp;
  const auto status = impl_->quiz->CreateQuiz(&ctx, req, &resp);

  QuizCoreCreateQuizResult out;
  out.status = mapStatus(status);
  if (!status.ok()) return out;
  if (resp.has_error()) {
    applyProtoErrorStatus(out, resp.error());
    return out;
  }
  if (resp.has_quiz()) out.quiz = mapQuiz(resp.quiz());
  out.status = QuizCoreRpcStatus::kOk;
  return out;
}

QuizCoreListQuizzesResult QuizCoreClientGrpc::listQuizzes(const std::optional<std::string>& ownerUserId,
                                                          uint32_t pageSize,
                                                          const std::string& pageToken,
                                                          const std::string& requestId) {
  grpc::ClientContext ctx;
  attachRequestId(ctx, requestId);
  ctx.set_deadline(std::chrono::system_clock::now() +
                   std::chrono::milliseconds(impl_->deadline_ms_list_quizzes));

  ListQuizzesRequest req;
  if (ownerUserId.has_value()) req.mutable_owner_user_id()->set_value(*ownerUserId);
  req.set_page_size(pageSize);
  req.set_page_token(pageToken);

  ListQuizzesResponse resp;
  const auto status = impl_->quiz->ListQuizzes(&ctx, req, &resp);

  QuizCoreListQuizzesResult out;
  out.status = mapStatus(status);
  if (!status.ok()) return out;
  if (resp.has_error()) {
    applyProtoErrorStatus(out, resp.error());
    return out;
  }
  out.status = QuizCoreRpcStatus::kOk;
  out.next_page_token = resp.next_page_token();
  for (const auto& quiz : resp.quizzes()) out.quizzes.push_back(mapQuiz(quiz));
  return out;
}

QuizCoreGetQuizResult QuizCoreClientGrpc::getQuiz(const std::string& quizId,
                                                  const std::string& requestId) {
  grpc::ClientContext ctx;
  attachRequestId(ctx, requestId);
  ctx.set_deadline(std::chrono::system_clock::now() +
                   std::chrono::milliseconds(impl_->deadline_ms_get_quiz));

  GetQuizRequest req;
  req.mutable_quiz_id()->set_value(quizId);

  GetQuizResponse resp;
  const auto status = impl_->quiz->GetQuiz(&ctx, req, &resp);

  QuizCoreGetQuizResult out;
  out.status = mapStatus(status);
  if (!status.ok()) return out;
  if (resp.has_error()) {
    applyProtoErrorStatus(out, resp.error());
    return out;
  }
  if (resp.has_quiz()) out.quiz = mapQuiz(resp.quiz());
  out.status = QuizCoreRpcStatus::kOk;
  return out;
}

QuizCoreUpdateQuizResult QuizCoreClientGrpc::updateQuiz(const QuizCoreQuiz& quiz,
                                                        const std::string& requestId) {
  grpc::ClientContext ctx;
  attachRequestId(ctx, requestId);
  ctx.set_deadline(std::chrono::system_clock::now() +
                   std::chrono::milliseconds(impl_->deadline_ms_update_quiz));

  UpdateQuizRequest req;
  setQuiz(quiz, req.mutable_quiz());

  UpdateQuizResponse resp;
  const auto status = impl_->quiz->UpdateQuiz(&ctx, req, &resp);

  QuizCoreUpdateQuizResult out;
  out.status = mapStatus(status);
  if (!status.ok()) return out;
  if (resp.has_error()) {
    applyProtoErrorStatus(out, resp.error());
    return out;
  }
  if (resp.has_quiz()) out.quiz = mapQuiz(resp.quiz());
  out.status = QuizCoreRpcStatus::kOk;
  return out;
}

QuizCorePublishQuizResult QuizCoreClientGrpc::publishQuiz(const std::string& quizId,
                                                          const std::string& requestedByUserId,
                                                          const std::string& requestId) {
  grpc::ClientContext ctx;
  attachRequestId(ctx, requestId);
  ctx.set_deadline(std::chrono::system_clock::now() +
                   std::chrono::milliseconds(impl_->deadline_ms_publish_quiz));

  PublishQuizRequest req;
  req.mutable_quiz_id()->set_value(quizId);
  req.mutable_requested_by()->set_value(requestedByUserId);

  PublishQuizResponse resp;
  const auto status = impl_->quiz->PublishQuiz(&ctx, req, &resp);

  QuizCorePublishQuizResult out;
  out.status = mapStatus(status);
  if (!status.ok()) return out;
  if (resp.has_error()) {
    applyProtoErrorStatus(out, resp.error());
    return out;
  }
  if (resp.has_quiz()) out.quiz = mapQuiz(resp.quiz());
  out.published_version = resp.published_version();
  out.status = QuizCoreRpcStatus::kOk;
  return out;
}

QuizCoreStartAiQuizJobResult QuizCoreClientGrpc::startAiQuizJob(
    const std::string& requestedByUserId,
    const std::string& prompt,
    const std::optional<uint32_t>& desiredQuestionCount,
    const std::string& requestId) {
  grpc::ClientContext ctx;
  attachRequestId(ctx, requestId);
  ctx.set_deadline(std::chrono::system_clock::now() +
                   std::chrono::milliseconds(impl_->deadline_ms_start_ai_quiz_job));

  StartAiQuizJobRequest req;
  req.mutable_requested_by()->set_value(requestedByUserId);
  req.set_prompt(prompt);
  if (desiredQuestionCount.has_value()) req.set_desired_question_count(*desiredQuestionCount);

  StartAiQuizJobResponse resp;
  const auto status = impl_->quiz->StartAiQuizJob(&ctx, req, &resp);

  QuizCoreStartAiQuizJobResult out;
  out.status = mapStatus(status);
  if (!status.ok()) return out;
  if (resp.has_error()) {
    applyProtoErrorStatus(out, resp.error());
    return out;
  }
  out.job_id = resp.job_id();
  out.status_text = resp.status();
  out.status = QuizCoreRpcStatus::kOk;
  return out;
}

bool QuizCoreClientGrpc::pingHealth(const std::string& requestId) {
  grpc::ClientContext ctx;
  attachRequestId(ctx, requestId);
  ctx.set_deadline(std::chrono::system_clock::now() + std::chrono::milliseconds(500));
  PingRequest req;
  PingResponse resp;
  const auto status = impl_->health->Ping(&ctx, req, &resp);
  return status.ok();
}
