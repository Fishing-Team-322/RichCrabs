#pragma once
#include <optional>
#include <shared_mutex>
#include <string>
#include <unordered_map>

#include "model.hpp"

struct TokenClaims final {
  std::string pin;
  std::string role;    // "host" | "player"
  std::string subject; // host_id | player_id
};

struct CreateGameOut final {
  Game game;
  std::string host_token;   // opaque
};

struct JoinGameOut final {
  Player player;
  std::string player_token; // opaque
};

class GameManager final {
public:
  static GameManager& instance();

  void setPublicBaseUrl(std::string baseUrl);

  CreateGameOut createGame(const std::string& topic, int questionsPerTeam);
  std::optional<JoinGameOut> joinGame(const std::string& pin, const std::string& name);

  bool startGame(const std::string& pin, const std::string& hostToken);

  std::optional<Game> getState(const std::string& pin) const;

  std::string makeWsUrl(const std::string& token) const;
  std::optional<TokenClaims> verifyToken(const std::string& token) const;

private:
  GameManager() = default;

  mutable std::shared_mutex mu_;
  std::unordered_map<std::string, Game> games_;
  std::unordered_map<std::string, TokenClaims> tokens_;

  std::string public_base_url_ = "http://localhost:8080";
};