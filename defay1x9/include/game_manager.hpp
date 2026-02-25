#pragma once
#include <optional>
#include <string>

#include "quizcore_client.hpp"

struct CreateGameOut final {
  std::string room_id;
  std::string pin;
  std::string invite_token;
};

struct JoinGameOut final {
  std::string room_id;
  std::string player_id;
  std::string join_ticket;
};

class GameManager final {
public:
  explicit GameManager(QuizCoreClient& client);

  void setPublicBaseUrl(std::string baseUrl);

  std::optional<CreateGameOut> createGame(const std::string& ownerUserId,
                                           const std::string& quizId,
                                           const std::string& title);
  std::optional<JoinGameOut> joinGame(const std::string& pin, const std::string& name);
  std::optional<JoinGameOut> joinGameByInvite(const std::string& inviteToken, const std::string& name);

  bool startGame(const std::string& roomId, const std::string& requestedByUserId);

  std::optional<QuizCoreRoomState> getState(const std::string& roomId) const;

  std::string makeWsUrl() const;

private:
  QuizCoreClient& client_;
  std::string public_base_url_ = "http://localhost:8080";
};
