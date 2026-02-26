# syntax=docker/dockerfile:1.7-labs

FROM ubuntu:22.04 AS builder
ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
  git curl zip unzip tar ca-certificates \
  build-essential pkg-config \
  cmake ninja-build \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt
RUN git clone --depth 1 https://github.com/microsoft/vcpkg.git \
  && /opt/vcpkg/bootstrap-vcpkg.sh -disableMetrics

ENV VCPKG_ROOT=/opt/vcpkg
ENV VCPKG_FEATURE_FLAGS=manifests
ENV VCPKG_BINARY_SOURCES="clear;files,/root/.cache/vcpkg/bincache,readwrite"
ENV VCPKG_DEFAULT_TRIPLET=x64-linux-release
ENV VCPKG_DEFAULT_HOST_TRIPLET=x64-linux-release

WORKDIR /repo/defay1x9

COPY defay1x9/vcpkg.json /repo/defay1x9/vcpkg.json
COPY defay1x9/triplets/x64-linux-release.cmake /repo/defay1x9/triplets/x64-linux-release.cmake

RUN --mount=type=cache,target=/opt/vcpkg/downloads,id=vcpkg-downloads \
    --mount=type=cache,target=/opt/vcpkg/buildtrees,id=vcpkg-buildtrees-x64-linux-release \
    --mount=type=cache,target=/opt/vcpkg/packages,id=vcpkg-packages-x64-linux-release \
    --mount=type=cache,target=/root/.cache/vcpkg/bincache,id=vcpkg-bincache \
    /opt/vcpkg/vcpkg install \
      --triplet=x64-linux-release \
      --host-triplet=x64-linux-release \
      --overlay-triplets=/repo/defay1x9/triplets \
      --x-manifest-root=/repo/defay1x9 \
      --clean-after-build

COPY defay1x9/ /repo/defay1x9/
COPY richcrab/proto/proto/ /repo/richcrab/proto/proto/

RUN --mount=type=cache,target=/opt/vcpkg/downloads,id=vcpkg-downloads \
    --mount=type=cache,target=/opt/vcpkg/buildtrees,id=vcpkg-buildtrees-x64-linux-release \
    --mount=type=cache,target=/opt/vcpkg/packages,id=vcpkg-packages-x64-linux-release \
    --mount=type=cache,target=/root/.cache/vcpkg/bincache,id=vcpkg-bincache \
    cmake -S . -B build -G Ninja \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_TOOLCHAIN_FILE=/opt/vcpkg/scripts/buildsystems/vcpkg.cmake \
      -DVCPKG_TARGET_TRIPLET=x64-linux-release \
      -DVCPKG_HOST_TRIPLET=x64-linux-release \
      -DVCPKG_OVERLAY_TRIPLETS=/repo/defay1x9/triplets

RUN cmake --build /repo/defay1x9/build -j "$(nproc)"

# -------- runtime --------
FROM ubuntu:22.04 AS runtime
ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /repo/defay1x9/build/defay1x9 /app/defay1x9
COPY --from=builder /repo/defay1x9/api /app/api

# ✅ runtime .so лежат в lib/
COPY --from=builder /repo/defay1x9/build/vcpkg_installed/x64-linux-release/lib /app/lib
ENV LD_LIBRARY_PATH=/app/lib

ENV GW_LISTEN_HOST=0.0.0.0
ENV GW_LISTEN_PORT=8080
ENV GW_PUBLIC_BASE_URL=http://localhost:8080
ENV GW_OPENAPI_PATH=./api/openapi.yaml

EXPOSE 8080
CMD ["/app/defay1x9"]