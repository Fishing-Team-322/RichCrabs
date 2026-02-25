#include "game_manager.hpp"
#include "jwt.hpp"
#include "random.hpp"
#include <mutex>

static bool validQpt(int v) { return v == 5 || v == 6 || v == 7; }

GameManager& GameManager::instance() {
  static GameManager gm;
  return gm;
}

void GameManager::setJwt(std::string secret, int ttlSeconds) {
  std::unique_lock lk(mu_);
  jwt_secret_ = std::move(secret);
  jwt_ttl_seconds_ = ttlSeconds;
}

void GameManager::setPublicBaseUrl(std::string baseUrl) {
  std::unique_lock lk(mu_);
  public_base_url_ = std::move(baseUrl);
}

CreateGameOut GameManager::createGame(const std::string& topic, int questionsPerTeam) {
  std::unique_lock lk(mu_);

  Game g;
  g.topic = topic;
  g.questions_per_team = validQpt(questionsPerTeam) ? questionsPerTeam : 5;

  for (int i = 0; i < 30; ++i) {
    auto pin = util::random_alnum_upper(6);
    if (games_.find(pin) == games_.end()) { g.pin = pin; break; }
  }
  if (g.pin.empty()) g.pin = util::random_alnum_upper(6);

  g.host_id = "h_" + util::random_hex(16);
  g.status = GameStatus::Lobby;

  auto hostToken = security::MakeTokenHost(jwt_secret_, jwt_ttl_seconds_, g.pin, g.host_id);

  games_[g.pin] = g;
  return CreateGameOut{g, hostToken};
}

std::optional<JoinGameOut> GameManager::joinGame(const std::string& pin, const std::string& name) {
  std::unique_lock lk(mu_);
  auto it = games_.find(pin);
  if (it == games_.end()) return std::nullopt;

  Game& g = it->second;
  if (g.status != GameStatus::Lobby) return std::nullopt;

  if (name.empty() || name.size() > 32) return std::nullopt;

  // Баланс команд
  int cntA = 0, cntB = 0;
  for (auto& p : g.players) (p.team == 'A' ? cntA : cntB)++;

  Player p;
  p.player_id = "p_" + util::random_hex(16);
  p.name = name;
  p.team = (cntA <= cntB) ? 'A' : 'B';

  g.players.push_back(p);

  auto token = security::MakeTokenPlayer(jwt_secret_, jwt_ttl_seconds_, pin, p.player_id);
  return JoinGameOut{p, token};
}

bool GameManager::startGame(const std::string& pin, const std::string& hostId) {
  std::unique_lock lk(mu_);
  auto it = games_.find(pin);
  if (it == games_.end()) return false;

  Game& g = it->second;
  if (g.host_id != hostId) return false;
  if (g.status != GameStatus::Lobby) return false;

  g.status = GameStatus::Running;
  return true;
}

std::optional<Game> GameManager::getState(const std::string& pin) const {
  std::shared_lock lk(mu_);
  auto it = games_.find(pin);
  if (it == games_.end()) return std::nullopt;
  return it->second;
}

std::string GameManager::makeWsUrl(const std::string& token) const {
  std::shared_lock lk(mu_);
  return public_base_url_ + "/ws?token=" + token;
}