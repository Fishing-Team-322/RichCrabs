#pragma once
#include <string>
#include <vector>

enum class GameStatus { Lobby, Running, Finished };

inline const char* to_string(GameStatus s) {
  switch (s) {
    case GameStatus::Lobby: return "lobby";
    case GameStatus::Running: return "running";
    case GameStatus::Finished: return "finished";
  }
  return "lobby";
}

struct Player final {
  std::string player_id;
  std::string name;
  char team = 'A'; // 'A'|'B'
};

struct Score final {
  int A = 0;
  int B = 0;
};

struct Game final {
  std::string pin;
  std::string topic;
  int questions_per_team = 5;

  std::string host_id;
  GameStatus status = GameStatus::Lobby;

  std::vector<Player> players;
  Score score;
};