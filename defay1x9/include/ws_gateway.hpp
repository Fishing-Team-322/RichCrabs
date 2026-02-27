#pragma once
#include <drogon/WebSocketController.h>
#include <string>

class WsGateway final : public drogon::WebSocketController<WsGateway> {
public:
  // WS protocol contract.
  // Client message types: ping, start_game, pause_game, resume_game, next_question, submit_answer, get_state.
  // Server message types: hello, room_event, room_state, error, pong, start_game_result, pause_game_result, resume_game_result, next_question_result, submit_answer_result.
  struct Protocol final {
    static constexpr const char* kClientPing = "ping";
    static constexpr const char* kClientStartGame = "start_game";
    static constexpr const char* kClientPauseGame = "pause_game";
    static constexpr const char* kClientResumeGame = "resume_game";
    static constexpr const char* kClientNextQuestion = "next_question";
    static constexpr const char* kClientSubmitAnswer = "submit_answer";
    static constexpr const char* kClientGetState = "get_state";

    static constexpr const char* kServerHello = "hello";
    static constexpr const char* kServerRoomEvent = "room_event";
    static constexpr const char* kServerRoomState = "room_state";
    static constexpr const char* kServerError = "error";
    static constexpr const char* kServerPong = "pong";
    static constexpr const char* kServerStartGameResult = "start_game_result";
    static constexpr const char* kServerPauseGameResult = "pause_game_result";
    static constexpr const char* kServerResumeGameResult = "resume_game_result";
    static constexpr const char* kServerNextQuestionResult = "next_question_result";
    static constexpr const char* kServerSubmitAnswerResult = "submit_answer_result";
  };

  void handleNewConnection(const drogon::HttpRequestPtr& req,
                           const drogon::WebSocketConnectionPtr& conn) override;

  // В Drogon правильное имя: handleNewMessage
  void handleNewMessage(const drogon::WebSocketConnectionPtr& conn,
                        std::string&& message,
                        const drogon::WebSocketMessageType& type) override;

  void handleConnectionClosed(const drogon::WebSocketConnectionPtr& conn) override;

  WS_PATH_LIST_BEGIN
  WS_PATH_ADD("/ws", drogon::Get);
  WS_PATH_LIST_END
};
