cmake_minimum_required(VERSION 3.22)
project(defay1x9 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

find_package(Drogon CONFIG REQUIRED)
find_package(spdlog CONFIG REQUIRED)
find_package(Protobuf CONFIG REQUIRED)
find_package(gRPC CONFIG REQUIRED)
find_package(OpenSSL REQUIRED)

set(PROTO_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../richcrab/proto/proto")
file(GLOB PROTO_FILES "${PROTO_ROOT}/*.proto")
set(PROTO_GEN_DIR "${CMAKE_CURRENT_BINARY_DIR}/generated")
file(MAKE_DIRECTORY "${PROTO_GEN_DIR}")

protobuf_generate(
  LANGUAGE cpp
  OUT_VAR PROTO_SRCS
  PROTOS ${PROTO_FILES}
  IMPORT_DIRS "${PROTO_ROOT}"
  PROTOC_OUT_DIR "${PROTO_GEN_DIR}"
)

set(GRPC_SRCS)
set(GRPC_HDRS)
foreach(PROTO_FILE ${PROTO_FILES})
  get_filename_component(PROTO_NAME "${PROTO_FILE}" NAME_WE)
  list(APPEND GRPC_SRCS "${PROTO_GEN_DIR}/${PROTO_NAME}.grpc.pb.cc")
  list(APPEND GRPC_HDRS "${PROTO_GEN_DIR}/${PROTO_NAME}.grpc.pb.h")

  add_custom_command(
    OUTPUT
      "${PROTO_GEN_DIR}/${PROTO_NAME}.grpc.pb.cc"
      "${PROTO_GEN_DIR}/${PROTO_NAME}.grpc.pb.h"
    COMMAND protobuf::protoc
    ARGS
      --grpc_out "${PROTO_GEN_DIR}"
      -I "${PROTO_ROOT}"
      --plugin=protoc-gen-grpc=$<TARGET_FILE:gRPC::grpc_cpp_plugin>
      "${PROTO_FILE}"
    DEPENDS "${PROTO_FILE}"
    VERBATIM
  )
endforeach()

add_executable(defay1x9
  src/main.cpp
  src/config.cpp
  src/quizcore_client_grpc.cpp
  src/game_manager.cpp
  src/ws_gateway.cpp
  src/csrf.cpp
  src/session.cpp
  ${PROTO_SRCS}
  ${GRPC_SRCS}
  ${GRPC_HDRS}
)

target_include_directories(defay1x9 PRIVATE
  include
  "${PROTO_GEN_DIR}"
)

target_link_libraries(defay1x9 PRIVATE
  Drogon::Drogon
  spdlog::spdlog
  gRPC::grpc++
  protobuf::libprotobuf
  OpenSSL::Crypto
)
