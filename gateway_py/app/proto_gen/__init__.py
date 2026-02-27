from pathlib import Path
import sys

# grpc_tools generates absolute imports like `import events_pb2`;
# expose this directory on sys.path so generated modules resolve each other.
_GEN_DIR = str(Path(__file__).resolve().parent)
if _GEN_DIR not in sys.path:
    sys.path.insert(0, _GEN_DIR)
