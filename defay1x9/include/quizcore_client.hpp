#pragma once

#include <cstdint>
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
};

class QuizCoreClientGrpc final : public QuizCoreClient {
public:
  QuizCoreClientGrpc(const std::string& gameAddr,
                     const std::string& joinAddr,
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

private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};
