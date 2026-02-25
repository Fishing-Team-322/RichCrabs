#pragma once
#include <optional>
#include <shared_mutex>
#include <string>
#include <unordered_map>

#include "model.hpp"

struct CreateGameOut final {
  Game game;
  std::string host_token;
};

struct JoinGameOut final {
  Player player;
  std::string player_token;
};

class GameManager final {
public:
  static GameManager& instance();

  void setJwt(std::string secret, int ttlSeconds);
  void setPublicBaseUrl(std::string baseUrl);

  CreateGameOut createGame(const std::string& topic, int questionsPerTeam);
  std::optional<JoinGameOut> joinGame(const std::string& pin, const std::string& name);

  bool startGame(const std::string& pin, const std::string& hostId);
  std::optional<Game> getState(const std::string& pin) const;

  std::string makeWsUrl(const std::string& token) const;

private:
  GameManager() = default;

  mutable std::shared_mutex mu_;
  std::unordered_map<std::string, Game> games_;

  std::string jwt_secret_ = "dev-secret-change-me";
  int jwt_ttl_seconds_ = 24 * 3600;
  std::string public_base_url_ = "http://localhost:8080";
};