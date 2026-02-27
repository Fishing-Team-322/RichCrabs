#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/gateway_py/app/proto_gen"
mkdir -p "$OUT"
python -m grpc_tools.protoc -I "$ROOT/richcrab/proto/proto" --python_out="$OUT" --grpc_python_out="$OUT"   "$ROOT"/richcrab/proto/proto/*.proto

# grpc_tools emits absolute imports (e.g. `import events_pb2`) for sibling proto modules.
# Rewrite them to package-relative imports so runtime works under `app.proto_gen`.
for f in "$OUT"/*_pb2.py "$OUT"/*_pb2_grpc.py; do
  [ -f "$f" ] || continue
  sed -E -i 's/^import ([a-zA-Z0-9_]+_pb2) as /from . import \1 as /' "$f"
done
