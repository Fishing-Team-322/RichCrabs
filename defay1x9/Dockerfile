# syntax=docker/dockerfile:1.7-labs

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
RUN git clone --depth 1 https://github.com/microsoft/vcpkg.git \
  && /opt/vcpkg/bootstrap-vcpkg.sh -disableMetrics

ENV VCPKG_ROOT=/opt/vcpkg
ENV VCPKG_FEATURE_FLAGS=manifests
ENV VCPKG_BINARY_SOURCES="clear;files,/root/.cache/vcpkg/bincache,readwrite"
ENV VCPKG_DEFAULT_TRIPLET=x64-linux-release
ENV VCPKG_DEFAULT_HOST_TRIPLET=x64-linux-release

WORKDIR /app

# copy only manifest/triplet first so dependency layer is reused while source code changes
COPY vcpkg.json /app/vcpkg.json
COPY triplets/x64-linux-release.cmake /app/triplets/x64-linux-release.cmake

# install deps with BuildKit caches
RUN --mount=type=cache,target=/opt/vcpkg/downloads,id=vcpkg-downloads \
    --mount=type=cache,target=/opt/vcpkg/buildtrees,id=vcpkg-buildtrees-x64-linux-release \
    --mount=type=cache,target=/opt/vcpkg/packages,id=vcpkg-packages-x64-linux-release \
    --mount=type=cache,target=/root/.cache/vcpkg/bincache,id=vcpkg-bincache \
    /opt/vcpkg/vcpkg install \
      --triplet=x64-linux-release \
      --host-triplet=x64-linux-release \
      --overlay-triplets=/app/triplets \
      --x-manifest-root=/app \
      --clean-after-build

# now copy project sources
COPY . /app

# build gateway
RUN --mount=type=cache,target=/opt/vcpkg/downloads,id=vcpkg-downloads \
    --mount=type=cache,target=/opt/vcpkg/buildtrees,id=vcpkg-buildtrees-x64-linux-release \
    --mount=type=cache,target=/opt/vcpkg/packages,id=vcpkg-packages-x64-linux-release \
    --mount=type=cache,target=/root/.cache/vcpkg/bincache,id=vcpkg-bincache \
    cmake -S . -B build -G Ninja \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_TOOLCHAIN_FILE=/opt/vcpkg/scripts/buildsystems/vcpkg.cmake \
      -DVCPKG_TARGET_TRIPLET=x64-linux-release \
      -DVCPKG_HOST_TRIPLET=x64-linux-release \
      -DVCPKG_OVERLAY_TRIPLETS=/app/triplets

RUN cmake --build /app/build -j"$(nproc)"

# -------- runtime --------
FROM ubuntu:22.04 AS runtime

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# binary
COPY --from=builder /app/build/defay1x9 /app/defay1x9

# openapi.yaml needed in runtime
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

# CSRF defaults (for local dev Secure=false)
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
