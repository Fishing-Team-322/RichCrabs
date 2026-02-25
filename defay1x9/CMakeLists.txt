cmake_minimum_required(VERSION 3.24)
project(defay1x9 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

find_package(Drogon CONFIG REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)
find_package(spdlog CONFIG REQUIRED)
find_package(jwt-cpp CONFIG REQUIRED)
find_package(OpenSSL REQUIRED)

add_executable(defay1x9
  src/main.cpp
  src/config.cpp
  src/jwt.cpp
  src/game_manager.cpp
  src/ws_gateway.cpp
)

target_include_directories(defay1x9 PRIVATE include)

target_link_libraries(defay1x9 PRIVATE
  Drogon::Drogon
  nlohmann_json::nlohmann_json
  spdlog::spdlog
  jwt-cpp::jwt-cpp
  OpenSSL::SSL
  OpenSSL::Crypto
)