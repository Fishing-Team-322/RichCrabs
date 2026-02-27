#pragma once

#include <cstdint>
#include <ctime>
#include <memory>
#include <optional>
#include <string>
#include <vector>

enum class QuizCoreRpcStatus {
  kOk,
  kPermissionDenied,
  kInvalidArgument,
  kNotFound,
  kFailedPrecondition,
  kDeadlineExceeded,
  kUnavailable,
  kUnknown,
};

struct QuizCoreCreateRoomResult final {
  QuizCoreRpcStatus status = QuizCoreRpcStatus::kUnknown;
  std::string error_code;
  std::string error_message;
  std::string room_id;
  std::string pin;
  std::string invite_token;
};

struct QuizCoreJoinRoomResult final {
  QuizCoreRpcStatus status = QuizCoreRpcStatus::kUnknown;
  std::string error_code;
  std::string error_message;
  std::string room_id;
  std::string join_ticket;
  std::string player_id;
};

struct QuizCoreStartGameResult final {
  QuizCoreRpcStatus status = QuizCoreRpcStatus::kUnknown;
  std::string error_code;
  std::string error_message;
  bool started = false;
};

struct QuizCoreLeaveRoomResult final {
  QuizCoreRpcStatus status = QuizCoreRpcStatus::kUnknown;
  bool left = false;
};

struct QuizCoreKickPlayerResult final {
  QuizCoreRpcStatus status = QuizCoreRpcStatus::kUnknown;
  bool kicked = false;
};

struct QuizCorePauseGameResult final {
  QuizCoreRpcStatus status = QuizCoreRpcStatus::kUnknown;
  bool paused = false;
};

struct QuizCoreResumeGameResult final {
  QuizCoreRpcStatus status = QuizCoreRpcStatus::kUnknown;
  bool resumed = false;
};

struct QuizCoreNextQuestionResult final {
  QuizCoreRpcStatus status = QuizCoreRpcStatus::kUnknown;
  bool advanced = false;
};

struct QuizCoreSubmitAnswerResult final {
  QuizCoreRpcStatus status = QuizCoreRpcStatus::kUnknown;
  bool accepted = false;
  uint32_t score_delta = 0;
};

struct QuizCorePlayerState final {
  std::string player_id;
  std::string display_name;
  uint32_t score = 0;
};

struct QuizCoreRoomState final {
  std::string room_id;
  std::string state;
  std::vector<QuizCorePlayerState> players;
  std::optional<std::string> current_question_id;
};

struct QuizCoreBot final {
  std::string bot_id;
  std::string name;
  std::string version;
  std::string status;
  std::time_t registered_at = 0;
};

struct QuizCoreRegisterBotResult final {
  QuizCoreRpcStatus status = QuizCoreRpcStatus::kUnknown;
  std::string error_code;
  std::string error_message;
  std::optional<QuizCoreBot> bot;
};

struct QuizCoreListBotsResult final {
  QuizCoreRpcStatus status = QuizCoreRpcStatus::kUnknown;
  std::string error_code;
  std::string error_message;
  std::vector<QuizCoreBot> bots;
};

struct QuizCoreRemoveBotResult final {
  QuizCoreRpcStatus status = QuizCoreRpcStatus::kUnknown;
  std::string error_code;
  std::string error_message;
  bool removed = false;
};

struct QuizCoreGetBotResult final {
  QuizCoreRpcStatus status = QuizCoreRpcStatus::kUnknown;
  std::string error_code;
  std::string error_message;
  std::optional<QuizCoreBot> bot;
};

struct QuizCoreGetRoomStateResult final {
  QuizCoreRpcStatus status = QuizCoreRpcStatus::kUnknown;
  std::string error_code;
  std::string error_message;
  std::optional<QuizCoreRoomState> room_state;
};

struct QuizCoreQuizQuestion final {
  std::string id;
  std::string text;
  std::vector<std::string> options;
  std::optional<uint32_t> correct_option_index;
};

struct QuizCoreQuiz final {
  std::string quiz_id;
  std::string owner_user_id;
  std::string title;
  std::string description;
  std::vector<QuizCoreQuizQuestion> questions;
};

struct QuizCoreCreateQuizResult final {
  QuizCoreRpcStatus status = QuizCoreRpcStatus::kUnknown;
  std::string error_code;
  std::string error_message;
  std::optional<QuizCoreQuiz> quiz;
};

struct QuizCoreListQuizzesResult final {
  QuizCoreRpcStatus status = QuizCoreRpcStatus::kUnknown;
  std::string error_code;
  std::string error_message;
  std::vector<QuizCoreQuiz> quizzes;
  std::string next_page_token;
};

struct QuizCoreGetQuizResult final {
  QuizCoreRpcStatus status = QuizCoreRpcStatus::kUnknown;
  std::string error_code;
  std::string error_message;
  std::optional<QuizCoreQuiz> quiz;
};

struct QuizCoreUpdateQuizResult final {
  QuizCoreRpcStatus status = QuizCoreRpcStatus::kUnknown;
  std::string error_code;
  std::string error_message;
  std::optional<QuizCoreQuiz> quiz;
};

struct QuizCorePublishQuizResult final {
  QuizCoreRpcStatus status = QuizCoreRpcStatus::kUnknown;
  std::string error_code;
  std::string error_message;
  std::optional<QuizCoreQuiz> quiz;
  uint32_t published_version = 0;
};

struct QuizCoreStartAiQuizJobResult final {
  QuizCoreRpcStatus status = QuizCoreRpcStatus::kUnknown;
  std::string error_code;
  std::string error_message;
  std::string job_id;
  std::string status_text;
};

class QuizCoreClient {
public:
  virtual ~QuizCoreClient() = default;

  virtual std::optional<QuizCoreCreateRoomResult> createRoom(const std::string& ownerUserId,
                                                              const std::string& quizId,
                                                              const std::string& title,
                                                              const std::string& requestId = "") = 0;
  virtual std::optional<QuizCoreJoinRoomResult> joinRoomByPin(const std::string& pin,
                                                              const std::string& displayName,
                                                              const std::string& requestId = "") = 0;
  virtual std::optional<QuizCoreJoinRoomResult> joinRoomByInvite(const std::string& inviteToken,
                                                                 const std::string& displayName,
                                                                 const std::string& requestId = "") = 0;
  virtual QuizCoreStartGameResult startGame(const std::string& roomId,
                                            const std::string& requestedByUserId,
                                            const std::string& requestId = "") = 0;
  virtual QuizCoreLeaveRoomResult leaveRoom(const std::string& roomId,
                                            const std::string& playerId,
                                            const std::string& requestId = "") = 0;
  virtual QuizCoreKickPlayerResult kickPlayer(const std::string& roomId,
                                              const std::string& requestedByUserId,
                                              const std::string& playerId,
                                              const std::string& requestId = "") = 0;
  virtual QuizCorePauseGameResult pauseGame(const std::string& roomId,
                                            const std::string& requestedByUserId,
                                            const std::string& requestId = "") = 0;
  virtual QuizCoreResumeGameResult resumeGame(const std::string& roomId,
                                              const std::string& requestedByUserId,
                                              const std::string& requestId = "") = 0;
  virtual QuizCoreNextQuestionResult nextQuestion(const std::string& roomId,
                                                  const std::string& requestedByUserId,
                                                  const std::string& requestId = "") = 0;
  virtual QuizCoreSubmitAnswerResult submitAnswer(const std::string& roomId,
                                                  const std::string& playerId,
                                                  const std::string& questionId,
                                                  const std::string& answer,
                                                  const std::string& requestId = "") = 0;
  virtual QuizCoreGetRoomStateResult getRoomState(const std::string& roomId,
                                                  const std::string& requestId = "") = 0;
  virtual QuizCoreRegisterBotResult registerBot(const std::string& userId,
                                                const std::string& name,
                                                const std::string& version,
                                                const std::string& endpoint,
                                                const std::string& requestId = "") = 0;
  virtual QuizCoreListBotsResult listBots(const std::string& userId,
                                          const std::string& requestId = "") = 0;
  virtual QuizCoreRemoveBotResult removeBot(const std::string& userId,
                                            const std::string& botId,
                                            const std::string& requestId = "") = 0;
  virtual QuizCoreGetBotResult getBotStatus(const std::string& userId,
                                            const std::string& botId,
                                            const std::string& requestId = "") = 0;
  virtual QuizCoreCreateQuizResult createQuiz(const std::string& ownerUserId,
                                              const std::string& title,
                                              const std::string& description,
                                              const std::vector<QuizCoreQuizQuestion>& questions,
                                              const std::string& requestId = "") = 0;
  virtual QuizCoreListQuizzesResult listQuizzes(const std::optional<std::string>& ownerUserId,
                                                uint32_t pageSize,
                                                const std::string& pageToken,
                                                const std::string& requestId = "") = 0;
  virtual QuizCoreGetQuizResult getQuiz(const std::string& quizId,
                                        const std::string& requestId = "") = 0;
  virtual QuizCoreUpdateQuizResult updateQuiz(const QuizCoreQuiz& quiz,
                                              const std::string& requestId = "") = 0;
  virtual QuizCorePublishQuizResult publishQuiz(const std::string& quizId,
                                                const std::string& requestedByUserId,
                                                const std::string& requestId = "") = 0;
  virtual QuizCoreStartAiQuizJobResult startAiQuizJob(const std::string& requestedByUserId,
                                                      const std::string& prompt,
                                                      const std::optional<uint32_t>& desiredQuestionCount,
                                                      const std::string& requestId = "") = 0;
  virtual bool pingHealth(const std::string& requestId = "") = 0;
};

class QuizCoreClientGrpc final : public QuizCoreClient {
public:
  QuizCoreClientGrpc(const std::string& gameAddr,
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
                     int deadlineMsStartAiQuizJob);
  ~QuizCoreClientGrpc() override;

  QuizCoreClientGrpc(const QuizCoreClientGrpc&) = delete;
  QuizCoreClientGrpc& operator=(const QuizCoreClientGrpc&) = delete;

  std::optional<QuizCoreCreateRoomResult> createRoom(const std::string& ownerUserId,
                                                      const std::string& quizId,
                                                      const std::string& title,
                                                      const std::string& requestId = "") override;
  std::optional<QuizCoreJoinRoomResult> joinRoomByPin(const std::string& pin,
                                                      const std::string& displayName,
                                                      const std::string& requestId = "") override;
  std::optional<QuizCoreJoinRoomResult> joinRoomByInvite(const std::string& inviteToken,
                                                         const std::string& displayName,
                                                         const std::string& requestId = "") override;
  QuizCoreStartGameResult startGame(const std::string& roomId,
                                    const std::string& requestedByUserId,
                                    const std::string& requestId = "") override;
  QuizCoreLeaveRoomResult leaveRoom(const std::string& roomId,
                                    const std::string& playerId,
                                    const std::string& requestId = "") override;
  QuizCoreKickPlayerResult kickPlayer(const std::string& roomId,
                                      const std::string& requestedByUserId,
                                      const std::string& playerId,
                                      const std::string& requestId = "") override;
  QuizCorePauseGameResult pauseGame(const std::string& roomId,
                                    const std::string& requestedByUserId,
                                    const std::string& requestId = "") override;
  QuizCoreResumeGameResult resumeGame(const std::string& roomId,
                                      const std::string& requestedByUserId,
                                      const std::string& requestId = "") override;
  QuizCoreNextQuestionResult nextQuestion(const std::string& roomId,
                                          const std::string& requestedByUserId,
                                          const std::string& requestId = "") override;
  QuizCoreSubmitAnswerResult submitAnswer(const std::string& roomId,
                                          const std::string& playerId,
                                          const std::string& questionId,
                                          const std::string& answer,
                                          const std::string& requestId = "") override;
  QuizCoreGetRoomStateResult getRoomState(const std::string& roomId,
                                          const std::string& requestId = "") override;
  QuizCoreRegisterBotResult registerBot(const std::string& userId,
                                        const std::string& name,
                                        const std::string& version,
                                        const std::string& endpoint,
                                        const std::string& requestId = "") override;
  QuizCoreListBotsResult listBots(const std::string& userId,
                                  const std::string& requestId = "") override;
  QuizCoreRemoveBotResult removeBot(const std::string& userId,
                                    const std::string& botId,
                                    const std::string& requestId = "") override;
  QuizCoreGetBotResult getBotStatus(const std::string& userId,
                                    const std::string& botId,
                                    const std::string& requestId = "") override;
  QuizCoreCreateQuizResult createQuiz(const std::string& ownerUserId,
                                      const std::string& title,
                                      const std::string& description,
                                      const std::vector<QuizCoreQuizQuestion>& questions,
                                      const std::string& requestId = "") override;
  QuizCoreListQuizzesResult listQuizzes(const std::optional<std::string>& ownerUserId,
                                        uint32_t pageSize,
                                        const std::string& pageToken,
                                        const std::string& requestId = "") override;
  QuizCoreGetQuizResult getQuiz(const std::string& quizId,
                                const std::string& requestId = "") override;
  QuizCoreUpdateQuizResult updateQuiz(const QuizCoreQuiz& quiz,
                                      const std::string& requestId = "") override;
  QuizCorePublishQuizResult publishQuiz(const std::string& quizId,
                                        const std::string& requestedByUserId,
                                        const std::string& requestId = "") override;
  QuizCoreStartAiQuizJobResult startAiQuizJob(const std::string& requestedByUserId,
                                              const std::string& prompt,
                                              const std::optional<uint32_t>& desiredQuestionCount,
                                              const std::string& requestId = "") override;
  bool pingHealth(const std::string& requestId = "") override;

private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};
