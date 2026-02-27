#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GATEWAY_DIR="$ROOT_DIR/defay1x9"
BUILD_DIR="$GATEWAY_DIR/build-linux"
ARTIFACT_DIR="$GATEWAY_DIR/bin"
ARTIFACT_BIN="$ARTIFACT_DIR/defay1x9"
ARTIFACT_LIB_DIR="$ARTIFACT_DIR/lib"
VCPKG_CACHE_DIR="$ROOT_DIR/.cache/vcpkg"
TRIPLET="x64-linux-release"
BUILDER_IMAGE="ubuntu:22.04"

mkdir -p "$BUILD_DIR" "$ARTIFACT_LIB_DIR" "$VCPKG_CACHE_DIR"

echo "[gateway-build] Building Linux gateway binary in an isolated builder container..."

docker run --rm \
  -u "$(id -u):$(id -g)" \
  -e DEBIAN_FRONTEND=noninteractive \
  -e VCPKG_FEATURE_FLAGS=manifests \
  -e VCPKG_DEFAULT_TRIPLET="$TRIPLET" \
  -e VCPKG_DEFAULT_HOST_TRIPLET="$TRIPLET" \
  -v "$ROOT_DIR:/repo" \
  -v "$VCPKG_CACHE_DIR:/opt/vcpkg" \
  -w /repo \
  "$BUILDER_IMAGE" \
  bash -lc '
    set -euo pipefail

    apt-get update >/dev/null
    apt-get install -y --no-install-recommends \
      git curl zip unzip tar ca-certificates \
      build-essential pkg-config cmake ninja-build libssl-dev \
      bison flex autoconf automake libtool m4 linux-libc-dev \
      >/dev/null

    if [ ! -x /opt/vcpkg/vcpkg ]; then
      rm -rf /opt/vcpkg/*
      git clone --depth 1 https://github.com/microsoft/vcpkg.git /opt/vcpkg >/dev/null
      /opt/vcpkg/bootstrap-vcpkg.sh -disableMetrics >/dev/null
    fi

    cmake -S /repo/defay1x9 -B /repo/defay1x9/build-linux -G Ninja \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_TOOLCHAIN_FILE=/opt/vcpkg/scripts/buildsystems/vcpkg.cmake \
      -DVCPKG_MANIFEST_INSTALL=ON \
      -DVCPKG_TARGET_TRIPLET=$VCPKG_DEFAULT_TRIPLET \
      -DVCPKG_HOST_TRIPLET=$VCPKG_DEFAULT_HOST_TRIPLET \
      -DVCPKG_OVERLAY_TRIPLETS=/repo/defay1x9/triplets

    cmake --build /repo/defay1x9/build-linux -j "$(nproc)"
  '

if [ ! -f "$BUILD_DIR/defay1x9" ]; then
  echo "[gateway-build] ERROR: built binary not found at $BUILD_DIR/defay1x9" >&2
  exit 1
fi

install -m 0755 "$BUILD_DIR/defay1x9" "$ARTIFACT_BIN"
rm -rf "$ARTIFACT_LIB_DIR"
mkdir -p "$ARTIFACT_LIB_DIR"

if [ -d "$BUILD_DIR/vcpkg_installed/$TRIPLET/lib" ]; then
  find "$BUILD_DIR/vcpkg_installed/$TRIPLET/lib" -maxdepth 1 -type f \( -name '*.so' -o -name '*.so.*' \) -exec cp -a {} "$ARTIFACT_LIB_DIR/" \;
fi

if [ -d "$BUILD_DIR/vcpkg_installed/$TRIPLET/debug/lib" ]; then
  find "$BUILD_DIR/vcpkg_installed/$TRIPLET/debug/lib" -maxdepth 1 -type f \( -name '*.so' -o -name '*.so.*' \) -exec cp -a {} "$ARTIFACT_LIB_DIR/" \;
fi

chmod 0755 "$ARTIFACT_BIN"

echo "[gateway-build] Done."
echo "[gateway-build] Binary: $ARTIFACT_BIN"
echo "[gateway-build] Runtime libs: $ARTIFACT_LIB_DIR"
echo "[gateway-build] Next step: docker compose up -d --build"
