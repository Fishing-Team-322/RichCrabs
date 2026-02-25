#pragma once

// Здесь позже будет клиент к Rust core (gRPC/JSON-RPC и т.д.)
class QuizCoreClient {
public:
  virtual ~QuizCoreClient() = default;
};