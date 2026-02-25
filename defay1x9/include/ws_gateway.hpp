#pragma once
#include <drogon/WebSocketController.h>
#include <string>

class WsGateway final : public drogon::WebSocketController<WsGateway> {
public:
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