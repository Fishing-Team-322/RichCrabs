from __future__ import annotations
from datetime import datetime, timezone
from typing import Any


def canonical_invite_path(invite_token: str) -> str:
    return f"/invite/{invite_token}"


def ts_to_iso8601(ts: Any) -> str:
    if not ts:
        return datetime.now(timezone.utc).isoformat()
    seconds = getattr(ts, "seconds", 0)
    nanos = getattr(ts, "nanos", 0)
    return datetime.fromtimestamp(seconds + nanos / 1_000_000_000, tz=timezone.utc).isoformat()


def normalize_room_state(state: str) -> str:
    normalized = (state or "").lower()
    if normalized in {"in_progress", "playing"}:
        return "playing"
    if normalized in {"paused", "finished", "closed"}:
        return normalized
    return "lobby"


def visibility_from_settings(settings: Any) -> str:
    if not settings:
        return "private"
    return "public" if getattr(settings, "visibility", 0) == 2 else "private"


def settings_to_dict(settings: Any) -> dict[str, Any]:
    if not settings:
        return {"privacy": "private", "playerLimit": 20, "timers": {"lobbyTimerSec": 45, "questionTimerSec": 30, "answerRevealSec": 10}}
    timers = getattr(settings, "timers", None)
    return {
        "privacy": visibility_from_settings(settings),
        "playerLimit": int(getattr(settings, "player_limit", 20) or 20),
        "timers": {
            "lobbyTimerSec": int(getattr(timers, "lobby_timer_sec", 45) or 45),
            "questionTimerSec": int(getattr(timers, "question_timer_sec", 30) or 30),
            "answerRevealSec": int(getattr(timers, "answer_reveal_sec", 10) or 10),
        },
    }


def map_room_snapshot(room: Any) -> dict[str, Any]:
    players = [{"playerId": p.player_id.value, "name": p.display_name, "score": p.score, "teamId": p.team_id if hasattr(p, "team_id") else None} for p in room.players]
    settings = settings_to_dict(getattr(room, "settings", None))
    return {
        "roomId": room.room_id.value,
        "pin": room.pin,
        "quizId": room.quiz_id.value if room.quiz_id else "",
        "title": room.title,
        "state": normalize_room_state(room.state),
        "players": players,
        "playersCount": len(players),
        "hostUserId": room.owner_user_id.value if room.owner_user_id else "",
        "updatedAt": ts_to_iso8601(room.updated_at),
        "invitePath": room.invite_path or "",
        "settings": settings,
        "isPublic": settings["privacy"] == "public",
    }
