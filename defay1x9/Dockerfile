FROM ubuntu:22.04 AS builder
ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
  git curl zip unzip tar ca-certificates \
  build-essential pkg-config cmake ninja-build libssl-dev \
  bison flex autoconf automake libtool m4 linux-libc-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt
RUN git clone --depth 1 https://github.com/microsoft/vcpkg.git \
  && /opt/vcpkg/bootstrap-vcpkg.sh -disableMetrics

ENV VCPKG_ROOT=/opt/vcpkg
ENV VCPKG_FEATURE_FLAGS=manifests
ENV VCPKG_DEFAULT_TRIPLET=x64-linux-release
ENV VCPKG_DEFAULT_HOST_TRIPLET=x64-linux-release

WORKDIR /repo
COPY defay1x9/ /repo/defay1x9/
COPY richcrab/proto/proto/ /repo/richcrab/proto/proto/

WORKDIR /repo/defay1x9
RUN cmake -S . -B build -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_TOOLCHAIN_FILE=/opt/vcpkg/scripts/buildsystems/vcpkg.cmake \
  -DVCPKG_MANIFEST_INSTALL=ON \
  -DVCPKG_TARGET_TRIPLET=x64-linux-release \
  -DVCPKG_HOST_TRIPLET=x64-linux-release \
  -DVCPKG_OVERLAY_TRIPLETS=/repo/defay1x9/triplets

RUN cmake --build build -j "$(nproc)"

FROM ubuntu:22.04 AS runtime
ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y ca-certificates libssl3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /repo/defay1x9/build/defay1x9 /app/defay1x9
COPY --from=builder /repo/defay1x9/api /app/api
COPY --from=builder /repo/defay1x9/build/vcpkg_installed/x64-linux-release/lib /app/lib

ENV LD_LIBRARY_PATH=/app/lib
ENV GW_LISTEN_HOST=0.0.0.0
ENV GW_LISTEN_PORT=8080
ENV GW_PUBLIC_BASE_URL=http://localhost:8080
ENV GW_OPENAPI_PATH=./api/openapi.yaml

EXPOSE 8080
CMD ["/app/defay1x9"]
