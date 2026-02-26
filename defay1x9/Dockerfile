# -------- builder --------
FROM ubuntu:22.04 AS builder

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
  git curl zip unzip tar ca-certificates \
  build-essential pkg-config \
  cmake ninja-build \
  && rm -rf /var/lib/apt/lists/*

# vcpkg
WORKDIR /opt
RUN git clone https://github.com/microsoft/vcpkg.git
RUN /opt/vcpkg/bootstrap-vcpkg.sh -disableMetrics

ENV VCPKG_ROOT=/opt/vcpkg

# build
WORKDIR /app
COPY . .

RUN cmake -S . -B build -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_TOOLCHAIN_FILE=/opt/vcpkg/scripts/buildsystems/vcpkg.cmake

RUN cmake --build build -j

# -------- runtime --------
FROM ubuntu:22.04 AS runtime

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# бинарь
COPY --from=builder /app/build/defay1x9 /app/defay1x9

# openapi.yaml нужен в рантайме
COPY api /app/api

ENV GW_LISTEN_HOST=0.0.0.0
ENV GW_LISTEN_PORT=8080
ENV GW_PUBLIC_BASE_URL=http://localhost:8080
ENV GW_OPENAPI_PATH=./api/openapi.yaml

ENV GW_GRPC_GAME_ADDR=game:50051
ENV GW_GRPC_JOIN_ADDR=join:50052
ENV GW_GRPC_QUIZ_ADDR=quiz:50053
ENV GW_GRPC_ENTITLEMENTS_ADDR=entitlements:50054
ENV GW_GRPC_BOT_ADDR=bot:50055
ENV GW_DEFAULT_USER_ID=00000000-0000-0000-0000-000000000001
ENV GW_SESSION_SIGNING_KEY=dev-insecure-session-key
ENV GW_GRPC_DEADLINE_MS_CREATE_ROOM=1500
ENV GW_GRPC_DEADLINE_MS_ISSUE_JOIN_TICKET=1500
ENV GW_GRPC_DEADLINE_MS_JOIN_ROOM=1500
ENV GW_GRPC_DEADLINE_MS_START_GAME=1500
ENV GW_GRPC_DEADLINE_MS_GET_ROOM_STATE=1000

# CSRF defaults (для локалки Secure=false)
ENV GW_CSRF_COOKIE_NAME=XSRF-TOKEN
ENV GW_CSRF_HEADER_NAME=X-XSRF-TOKEN
ENV GW_CSRF_COOKIE_SECURE=false
ENV GW_CSRF_COOKIE_HTTPONLY=false
ENV GW_CSRF_COOKIE_PATH=/

# Session cookie
ENV GW_SESSION_COOKIE_NAME=QB-SESSION
ENV GW_SESSION_COOKIE_SECURE=false
ENV GW_SESSION_COOKIE_HTTPONLY=true
ENV GW_SESSION_COOKIE_PATH=/
ENV GW_SESSION_TTL_SECONDS=86400

EXPOSE 8080
CMD ["/app/defay1x9"]