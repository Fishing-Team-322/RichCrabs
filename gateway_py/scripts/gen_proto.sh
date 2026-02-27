#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/gateway_py/app/proto_gen"
mkdir -p "$OUT"
python -m grpc_tools.protoc -I "$ROOT/richcrab/proto/proto" --python_out="$OUT" --grpc_python_out="$OUT" \
  "$ROOT"/richcrab/proto/proto/*.proto
