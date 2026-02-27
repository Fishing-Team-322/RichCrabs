
def test_ws_ping_get_state_and_unsupported(client, host_session_cookie):
    with client.websocket_connect("/ws", cookies=host_session_cookie) as ws:
        hello = ws.receive_json()
        assert hello["type"] == "hello"

        ws.send_json({"type": "ping"})
        assert ws.receive_json()["type"] == "pong"

        ws.send_json({"type": "get_state"})
        state = ws.receive_json()
        assert state["type"] == "room_state"
        assert state["room_id"] == "room-1"

        ws.send_json({"type": "unknown"})
        err = ws.receive_json()
        assert err["type"] == "error"
        assert err["error"] == "unsupported_message_type"


def test_ws_rejects_missing_session(client):
    with client.websocket_connect("/ws") as ws:
        assert ws.receive() == {"type": "websocket.close", "code": 1000, "reason": ""}
