import os
import uuid
import grpc
from fastapi import APIRouter
from fastapi.responses import JSONResponse, PlainTextResponse
from app.config import settings
from app.grpc_clients.core import clients
from app.proto_gen import richcrab_pb2
from app.api.common import err

router = APIRouter(tags=["system"])


@router.get("/health")
@router.get("/api/v1/healthz")
def health(grpc_check: bool = False):
    body = {"status": "ok", "gateway": "ok", "requestId": uuid.uuid4().hex}
    if grpc_check:
        try:
            clients.health.Ping(richcrab_pb2.PingRequest())
            body["dependencies"] = {"rust_grpc": "ok"}
        except grpc.RpcError:
            body["status"] = "degraded"
            body["dependencies"] = {"rust_grpc": "down"}
            return JSONResponse(body, status_code=503)
    return body


@router.get("/openapi.yaml")
def old_openapi():
    if not os.path.exists(settings.openapi_path):
        return err(404, "not_found", "openapi schema file is missing")
    return PlainTextResponse(open(settings.openapi_path).read())
