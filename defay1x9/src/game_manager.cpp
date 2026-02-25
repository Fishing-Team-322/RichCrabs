#include "game_manager.hpp"

GameManager::GameManager(QuizCoreClient& client)
    : client_(client) {}

void GameManager::setPublicBaseUrl(std::string baseUrl) {
  public_base_url_ = std::move(baseUrl);
}

std::optional<CreateGameOut> GameManager::createGame(const std::string& topic, int questionsPerTeam) {
  auto out = client_.createRoom(topic, questionsPerTeam);
  if (!out) return std::nullopt;

  return CreateGameOut{out->room_id, out->pin, out->invite_token};
}

std::optional<JoinGameOut> GameManager::joinGame(const std::string& pin, const std::string& name) {
  auto out = client_.joinRoomByPin(pin, name);
  if (!out) return std::nullopt;

  return JoinGameOut{out->room_id, out->player_id, out->join_ticket};
}

bool GameManager::startGame(const std::string& roomId, const std::string& requestedByUserId) {
  return client_.startGame(roomId, requestedByUserId);
}

std::optional<QuizCoreRoomState> GameManager::getState(const std::string& roomId) const {
  return client_.getRoomState(roomId);
}

std::string GameManager::makeWsUrl() const {
  return public_base_url_ + "/ws";
}
