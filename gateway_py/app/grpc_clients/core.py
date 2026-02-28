from __future__ import annotations
import grpc
from typing import Any, Optional

from app.config import settings
from app.proto_gen import game_pb2_grpc, join_pb2_grpc, quiz_pb2_grpc, bot_pb2_grpc, auth_pb2_grpc, entitlements_pb2_grpc, richcrab_pb2_grpc


class Clients:
    def __init__(self) -> None:
        self.game_ch = grpc.insecure_channel(settings.grpc_game_addr)
        self.join_ch = grpc.insecure_channel(settings.grpc_join_addr)
        self.quiz_ch = grpc.insecure_channel(settings.grpc_quiz_addr)
        self.bot_ch = grpc.insecure_channel(settings.grpc_bot_addr)
        self.auth_ch = grpc.insecure_channel(settings.grpc_auth_addr)
        self.ent_ch = grpc.insecure_channel(settings.grpc_entitlements_addr)
        self.game = game_pb2_grpc.GameServiceStub(self.game_ch)
        self.join = join_pb2_grpc.JoinServiceStub(self.join_ch)
        self.quiz = quiz_pb2_grpc.QuizServiceStub(self.quiz_ch)
        self.bot = bot_pb2_grpc.BotServiceStub(self.bot_ch)
        self.auth = auth_pb2_grpc.AuthServiceStub(self.auth_ch)
        self.ent = entitlements_pb2_grpc.EntitlementsServiceStub(self.ent_ch)
        self.health = richcrab_pb2_grpc.HealthStub(self.game_ch)


def map_grpc_err(e: grpc.RpcError, op: str) -> tuple[int, dict[str, Any]]:
    code = e.code()
    details_fn = getattr(e, "details", None)
    details = details_fn() if callable(details_fn) else ""
    m = f"grpc unavailable: {op}"
    if code == grpc.StatusCode.DEADLINE_EXCEEDED:
        return 504, {"error": "grpc_timeout", "message": f"grpc timeout: {op}"}
    if code == grpc.StatusCode.NOT_FOUND:
        return 404, {"error": "not_found", "message": details or f"rpc not found: {op}"}
    if code == grpc.StatusCode.INVALID_ARGUMENT:
        return 400, {"error": "validation_error", "message": details or f"rpc invalid argument: {op}"}
    if code == grpc.StatusCode.PERMISSION_DENIED:
        return 403, {"error": "forbidden", "message": details or f"rpc permission denied: {op}"}
    if code == grpc.StatusCode.FAILED_PRECONDITION:
        return 409, {"error": "validation_error", "message": details or f"rpc precondition failed: {op}"}
    return 503, {"error": "grpc_unavailable", "message": details or m}


clients = Clients()
