from __future__ import annotations
import json
from typing import Any
from google.protobuf.json_format import MessageToDict


def room_event_to_dict(ev: Any) -> dict[str, Any]:
    try:
        return MessageToDict(ev, preserving_proto_field_name=True)
    except Exception:
        raw = str(ev).replace("\n", " ")
        try:
            return json.loads(raw)
        except Exception:
            return {"raw": raw}
