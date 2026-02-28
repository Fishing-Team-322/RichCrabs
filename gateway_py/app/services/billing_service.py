from __future__ import annotations
import json
import uuid
from datetime import datetime, timedelta, timezone
import redis
from app.config import settings

rdb = redis.from_url(settings.redis_url, decode_responses=True)

BILLING_PLANS = [{"id": "free", "code": "free", "title": "Free", "description": "Базовый план", "price": 0, "currency": "USD", "interval": "month", "limits": [{"key": "rooms", "title": "rooms", "value": 10}, {"key": "bots", "title": "bots", "value": 20}, {"key": "ai", "title": "ai", "value": 30}]}]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def default_subscription():
    now = datetime.now(timezone.utc)
    return {"id": "sub_free", "planCode": "free", "status": "active", "currentPeriodStart": now.isoformat(), "currentPeriodEnd": (now + timedelta(days=30)).isoformat(), "cancelAtPeriodEnd": False}


def _sub_key(uid: str) -> str:
    return f"billing:sub:{uid}"


def _history_key(uid: str) -> str:
    return f"billing:history:{uid}"


def _promo_key(uid: str) -> str:
    return f"billing:promo:{uid}"


def load_subscription(uid: str) -> dict:
    raw = rdb.get(_sub_key(uid))
    if not raw:
        return default_subscription()
    try:
        return json.loads(raw)
    except Exception:
        return default_subscription()


def save_subscription(uid: str, sub: dict):
    rdb.set(_sub_key(uid), json.dumps(sub))


def append_tx(uid: str, tx: dict):
    rdb.lpush(_history_key(uid), json.dumps(tx))
    rdb.ltrim(_history_key(uid), 0, 99)


def usage(uid: str):
    return {"usage": {"rooms": int(rdb.get(f"usage:{uid}:rooms") or 0), "bots": int(rdb.get(f"usage:{uid}:bots") or 0), "ai": int(rdb.get(f"usage:{uid}:ai") or 0)}}


def history(uid: str):
    out = []
    for row in rdb.lrange(_history_key(uid), 0, 99):
        try:
            out.append(json.loads(row))
        except Exception:
            pass
    return out


def apply_promo(uid: str, code: str):
    rdb.set(_promo_key(uid), code)


def checkout(uid: str, plan_code: str):
    plan = next((p for p in BILLING_PLANS if p["code"] == plan_code), None)
    if not plan:
        return None
    now = datetime.now(timezone.utc)
    save_subscription(uid, {"id": f"sub_{uid}", "planCode": plan_code, "status": "active", "currentPeriodStart": now.isoformat(), "currentPeriodEnd": (now + timedelta(days=30)).isoformat(), "cancelAtPeriodEnd": False, "renewedAt": now.isoformat()})
    append_tx(uid, {"id": f"tx_{uuid.uuid4().hex[:10]}", "status": "paid", "amount": plan["price"], "currency": plan["currency"], "occurredAt": now.isoformat(), "description": f"Subscription checkout: {plan_code}"})
    return {"checkoutUrl": "", "status": "paid"}
