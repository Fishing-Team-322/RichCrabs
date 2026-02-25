#pragma once

#include <cstdint>
#include <ctime>
#include <memory>
#include <optional>
#include <string>
#include <vector>

struct QuizCoreCreateRoomResult final {
  std::string room_id;
  std::string pin;
  std::string invite_token;
};

struct QuizCoreJoinRoomResult final {
  std::string room_id;
  std::string join_ticket;
  std::string player_id;
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

enum class QuizCoreRpcStatus {
  kOk,
  kPermissionDenied,
  kInvalidArgument,
  kFailedPrecondition,
  kUnavailable,
  kUnknown,
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
  std::optional<QuizCoreBot> bot;
};

struct QuizCoreListBotsResult final {
  QuizCoreRpcStatus status = QuizCoreRpcStatus::kUnknown;
  std::vector<QuizCoreBot> bots;
};

struct QuizCoreRemoveBotResult final {
  QuizCoreRpcStatus status = QuizCoreRpcStatus::kUnknown;
  bool removed = false;
};

struct QuizCoreGetBotResult final {
  QuizCoreRpcStatus status = QuizCoreRpcStatus::kUnknown;
  std::optional<QuizCoreBot> bot;
};

class QuizCoreClient {
public:
  virtual ~QuizCoreClient() = default;

  virtual std::optional<QuizCoreCreateRoomResult> createRoom(const std::string& ownerUserId,
                                                              const std::string& quizId,
                                                              const std::string& title) = 0;
  virtual std::optional<QuizCoreJoinRoomResult> joinRoomByPin(const std::string& pin,
                                                              const std::string& displayName) = 0;
  virtual std::optional<QuizCoreJoinRoomResult> joinRoomByInvite(const std::string& inviteToken,
                                                                 const std::string& displayName) = 0;
  virtual bool startGame(const std::string& roomId, const std::string& requestedByUserId) = 0;
  virtual std::optional<QuizCoreRoomState> getRoomState(const std::string& roomId) = 0;
  virtual QuizCoreRegisterBotResult registerBot(const std::string& userId,
                                                const std::string& name,
                                                const std::string& version,
                                                const std::string& endpoint) = 0;
  virtual QuizCoreListBotsResult listBots(const std::string& userId) = 0;
  virtual QuizCoreRemoveBotResult removeBot(const std::string& userId,
                                            const std::string& botId) = 0;
  virtual QuizCoreGetBotResult getBotStatus(const std::string& userId,
                                            const std::string& botId) = 0;
};

class QuizCoreClientGrpc final : public QuizCoreClient {
public:
  QuizCoreClientGrpc(const std::string& gameAddr,
                     const std::string& joinAddr,
                     const std::string& botAddr,
                     int deadlineMsCreateRoom,
                     int deadlineMsIssueJoinTicket,
                     int deadlineMsJoinRoom,
                     int deadlineMsStartGame,
                     int deadlineMsGetRoomState);
  ~QuizCoreClientGrpc() override;

  QuizCoreClientGrpc(const QuizCoreClientGrpc&) = delete;
  QuizCoreClientGrpc& operator=(const QuizCoreClientGrpc&) = delete;

  std::optional<QuizCoreCreateRoomResult> createRoom(const std::string& ownerUserId,
                                                      const std::string& quizId,
                                                      const std::string& title) override;
  std::optional<QuizCoreJoinRoomResult> joinRoomByPin(const std::string& pin,
                                                      const std::string& displayName) override;
  std::optional<QuizCoreJoinRoomResult> joinRoomByInvite(const std::string& inviteToken,
                                                         const std::string& displayName) override;
  bool startGame(const std::string& roomId, const std::string& requestedByUserId) override;
  std::optional<QuizCoreRoomState> getRoomState(const std::string& roomId) override;
  QuizCoreRegisterBotResult registerBot(const std::string& userId,
                                        const std::string& name,
                                        const std::string& version,
                                        const std::string& endpoint) override;
  QuizCoreListBotsResult listBots(const std::string& userId) override;
  QuizCoreRemoveBotResult removeBot(const std::string& userId,
                                    const std::string& botId) override;
  QuizCoreGetBotResult getBotStatus(const std::string& userId,
                                    const std::string& botId) override;

private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};
