from types import ModuleType, SimpleNamespace

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient


def _install_proto_stubs():
    class Msg:
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)

    class IdMsg(Msg):
        def __init__(self, value="", **kwargs):
            super().__init__(value=value, **kwargs)

    class ListQuizzesRequest(Msg):
        def __init__(self, page_size=20, page_token=""):
            super().__init__(page_size=page_size, page_token=page_token, owner_user_id=IdMsg())

    class CreateQuizRequest(Msg):
        class _Questions(list):
            def add(self):
                q = Msg(options=[])
                self.append(q)
                return q

        def __init__(self, owner_user_id=None, title="", description=""):
            super().__init__(owner_user_id=owner_user_id or IdMsg(), title=title, description=description, questions=self._Questions())

    class GetAiQuizJobResponse(Msg):
        def HasField(self, field):
            return hasattr(self, field)

    pb2_classes = {
        "auth_pb2": ["RegisterRequest", "LoginRequest", "GetMeRequest", "UpdateProfileRequest", "ChangePasswordRequest", "GetAdminStatsRequest", "SetUserBanRequest"],
        "bot_pb2": ["RegisterBotRequest", "ListBotsRequest", "GetBotStatusRequest", "UpdateBotStatusRequest", "RemoveBotRequest"],
        "common_pb2": ["UserId", "QuizId", "RoomId", "PlayerId", "BotId"],
        "entitlements_pb2": [],
        "game_pb2": ["CreateRoomRequest", "RegenerateInviteRequest", "GetRoomStateRequest", "ListRoomsRequest", "JoinRoomRequest", "StartGameRequest", "PauseGameRequest", "ResumeGameRequest", "NextQuestionRequest", "LeaveRoomRequest", "KickPlayerRequest", "SubscribeRoomEventsRequest", "SubmitAnswerRequest", "PingRequest"],
        "join_pb2": ["IssueJoinTicketByPinRequest", "IssueJoinTicketByInviteRequest"],
        "quiz_pb2": ["ListQuizzesRequest", "CreateQuizRequest", "GetQuizRequest", "UpdateQuizRequest", "PublishQuizRequest", "StartAiQuizJobRequest", "GetAiQuizJobRequest"],
        "richcrab_pb2": ["PingRequest"],
    }

    for mod_name, cls_names in pb2_classes.items():
        module = ModuleType(f"app.proto_gen.{mod_name}")
        for name in cls_names:
            if mod_name == "common_pb2":
                setattr(module, name, IdMsg)
            elif mod_name == "quiz_pb2" and name == "ListQuizzesRequest":
                setattr(module, name, ListQuizzesRequest)
            elif mod_name == "quiz_pb2" and name == "CreateQuizRequest":
                setattr(module, name, CreateQuizRequest)
            elif mod_name == "quiz_pb2" and name == "GetAiQuizJobResponse":
                setattr(module, name, GetAiQuizJobResponse)
            else:
                setattr(module, name, Msg)
        sys.modules[f"app.proto_gen.{mod_name}"] = module

    grpc_mods = [
        "game_pb2_grpc",
        "join_pb2_grpc",
        "quiz_pb2_grpc",
        "bot_pb2_grpc",
        "auth_pb2_grpc",
        "entitlements_pb2_grpc",
        "richcrab_pb2_grpc",
    ]
    for mod_name in grpc_mods:
        module = ModuleType(f"app.proto_gen.{mod_name}")
        for stub in ["GameServiceStub", "JoinServiceStub", "QuizServiceStub", "BotServiceStub", "AuthServiceStub", "EntitlementsServiceStub", "HealthStub"]:
            setattr(module, stub, lambda ch: SimpleNamespace())
        sys.modules[f"app.proto_gen.{mod_name}"] = module


_install_proto_stubs()

from app import main
from app.security import SessionClaims, issue_session_token


def _ns(**kwargs):
    return SimpleNamespace(**kwargs)


class FakeRedis:
    def __init__(self):
        self._data = {}
        self._lists = {}

    def get(self, key):
        return self._data.get(key)

    def set(self, key, value):
        self._data[key] = value
        return True

    def lpush(self, key, value):
        self._lists.setdefault(key, []).insert(0, value)
        return len(self._lists[key])

    def ltrim(self, key, start, end):
        items = self._lists.get(key, [])
        self._lists[key] = items[start:end + 1]
        return True

    def lrange(self, key, start, end):
        items = self._lists.get(key, [])
        if end == -1:
            end = len(items) - 1
        return items[start:end + 1]

    def delete(self, key):
        self._data.pop(key, None)
        self._lists.pop(key, None)

    def lpush(self, key, value):
        bucket = self._lists.setdefault(key, [])
        bucket.insert(0, value)

    def ltrim(self, key, start, end):
        bucket = self._lists.get(key, [])
        if end == -1:
            self._lists[key] = bucket[start:]
            return
        self._lists[key] = bucket[start:end + 1]

    def lrange(self, key, start, end):
        bucket = self._lists.get(key, [])
        if end == -1:
            return bucket[start:]
        return bucket[start:end + 1]


class FakeClients:
    def __init__(self):
        self.auth = _ns(
            Register=lambda req: _ns(email_taken=False, user=_ns(id="u1", email=req.email, display_name=req.display_name, avatar_url="")),
            Login=lambda req: _ns(authenticated=True, user=_ns(id="u1", email=req.email, display_name="Host", avatar_url="")),
            GetAdminStats=lambda req: _ns(users_count=10, games_count=4, active_rooms=2),
            SetUserBan=lambda req: _ns(),
        )
        self.game = _ns(
            CreateRoom=lambda req: _ns(pin="123456", invite_token="inv1", invite_path="/invite/inv1", invite_qr_svg="<svg></svg>", room_id=_ns(value="room-1")),
            RegenerateInvite=lambda req: _ns(invite_token="inv2", invite_path="/invite/inv2", invite_qr_svg="<svg></svg>"),
            ListRooms=lambda req: _ns(rooms=[_ns(room_id=_ns(value="room-1"), pin="123456", owner_user_id=_ns(value="u1"), quiz_id=_ns(value="q1"), title="Room 1", state="LOBBY", updated_at=_ns(seconds=1, nanos=0), invite_path="/invite/inv1", players=[_ns(player_id=_ns(value="p1"), display_name="P1", score=0, team_id="A")])]),
            GetRoomState=lambda req: _ns(room_id=_ns(value="room-1"), state="LOBBY", players=[_ns(player_id=_ns(value="p1"), display_name="P1", score=0)]),
            JoinRoom=lambda req: _ns(player_id=_ns(value="p1")),
            StartGame=lambda req: _ns(started=True),
            PauseGame=lambda req: _ns(paused=True),
            ResumeGame=lambda req: _ns(resumed=True),
            NextQuestion=lambda req: _ns(advanced=True),
            SubmitAnswer=lambda req: _ns(accepted=True, score_delta=100),
            LeaveRoom=lambda req: _ns(),
            KickPlayer=lambda req: _ns(),
            SubscribeRoomEvents=lambda req: [],
        )
        self.join = _ns(
            IssueJoinTicketByPin=lambda req: _ns(ticket=_ns(token="ticket", room_id=_ns(value="room-1"))),
            IssueJoinTicketByInvite=lambda req: _ns(ticket=_ns(token="ticket", room_id=_ns(value="room-1"))),
        )
        self.quiz = _ns(
            ListQuizzes=lambda req: _ns(quizzes=[], next_page_token=""),
            CreateQuiz=lambda req: _ns(quiz=_ns(quiz_id=_ns(value="q1"), owner_user_id=_ns(value="u1"), title=req.title, description=req.description)),
            GetQuiz=lambda req: _ns(quiz=_ns(quiz_id=_ns(value=req.quiz_id.value), owner_user_id=_ns(value="u1"), title="Quiz", description="Desc", questions=[])),
            UpdateQuiz=lambda req: _ns(quiz=req.quiz),
            PublishQuiz=lambda req: _ns(quiz=_ns(quiz_id=_ns(value=req.quiz_id.value)), published_version=1),
            StartAiQuizJob=lambda req: _ns(job_id="job-1", status="DONE"),
            GetAiQuizJob=lambda req: _ns(job_id=req.job_id, status="DONE", HasField=lambda f: False),
        )
        self.bot = _ns(
            RegisterBot=lambda req, metadata=None: _ns(bot=_ns(bot_id=_ns(value="b1"), name=req.name, version=req.version, status="active")),
            ListBots=lambda req, metadata=None: _ns(bots=[_ns(bot_id=_ns(value="b1"), name="Bot", version="1", status="active")]),
            GetBotStatus=lambda req, metadata=None: _ns(bot=_ns(bot_id=_ns(value=req.bot_id.value), name="Bot", version="1", status="active")),
            UpdateBotStatus=lambda req, metadata=None: _ns(bot=_ns(bot_id=_ns(value=req.bot_id.value), name="Bot", version="1", status="disabled")),
            RemoveBot=lambda req, metadata=None: _ns(),
        )
        self.health = _ns(Ping=lambda req: _ns())


@pytest.fixture()
def fake_clients(monkeypatch):
    clients = FakeClients()
    monkeypatch.setattr("app.grpc_clients.core.clients", clients)
    monkeypatch.setattr(main, "clients", clients)
    return clients


@pytest.fixture()
def fake_rdb(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(main, "rdb", redis)
    return redis


@pytest.fixture()
def client(fake_clients, fake_rdb):
    return TestClient(main.app)


@pytest.fixture()
def host_session_cookie():
    token = issue_session_token(SessionClaims(session_type="auth", role="host", user_id="u1", room_id="room-1", pin="123456"), 3600)
    return {main.settings.session_cookie_name: token}


@pytest.fixture()
def player_session_cookie():
    token = issue_session_token(SessionClaims(session_type="game", role="player", player_id="p1", room_id="room-1", pin="123456"), 3600)
    return {main.settings.session_cookie_name: token}


@pytest.fixture()
def csrf_headers():
    token = "csrf-token"
    return {
        "cookies": {main.settings.csrf_cookie_name: token},
        "headers": {main.settings.csrf_header_name: token},
    }
