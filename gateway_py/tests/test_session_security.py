import random
import string
import time

from app.security import SessionClaims, issue_session_token, verify_session_token


def _rand(n=8):
    return "".join(random.choice(string.ascii_lowercase) for _ in range(n))


def test_issue_and_verify_session_token_property_like_roundtrip():
    for _ in range(25):
        claims = SessionClaims(
            session_type=random.choice(["auth", "game"]),
            role=random.choice(["host", "player", "admin"]),
            pin=_rand(6),
            room_id=f"room-{_rand(5)}",
            player_id=f"p-{_rand(4)}",
            user_id=f"u-{_rand(4)}",
        )
        token = issue_session_token(claims, ttl=60)
        verified = verify_session_token(token)
        assert verified is not None
        assert verified.role == claims.role
        assert verified.room_id == claims.room_id


def test_verify_rejects_expired_token():
    token = issue_session_token(SessionClaims(role="host", user_id="u1"), ttl=1)
    time.sleep(1.1)
    assert verify_session_token(token) is None


def test_verify_rejects_tampered_token():
    token = issue_session_token(SessionClaims(role="host", user_id="u1"), ttl=60)
    body, sig = token.split(".", 1)
    bad = body[:-1] + ("A" if body[-1] != "A" else "B") + "." + sig
    assert verify_session_token(bad) is None
