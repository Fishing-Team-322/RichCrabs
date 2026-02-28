
import asyncio
import grpc
import pytest


class _EventMsg:
    def __init__(self, payload: str):
        self.payload = payload

    def __str__(self):
        return self.payload


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


@pytest.mark.asyncio
async def test_ws_streams_room_events_without_client_request(client, fake_clients, host_session_cookie):
    fake_clients.game.SubscribeRoomEvents = lambda req: iter([_EventMsg('{"kind":"ROOM_UPDATED"}')])

    def _receive_event():
        with client.websocket_connect("/ws", cookies=host_session_cookie) as ws:
            assert ws.receive_json()["type"] == "hello"
            return ws.receive_json()

    room_event = await asyncio.to_thread(_receive_event)
    assert room_event == {"type": "room_event", "event": {"kind": "ROOM_UPDATED"}}


@pytest.mark.asyncio
async def test_ws_streaming_grpc_error_is_sent_as_structured_error(client, fake_clients, host_session_cookie):
    class _StreamRpcError(grpc.RpcError):
        pass

    def _raise(_):
        raise _StreamRpcError("stream failed")

    fake_clients.game.SubscribeRoomEvents = _raise

    def _receive_error():
        with client.websocket_connect("/ws", cookies=host_session_cookie) as ws:
            assert ws.receive_json()["type"] == "hello"
            return ws.receive_json()

    err_msg = await asyncio.to_thread(_receive_error)
    assert err_msg["type"] == "error"
    assert err_msg["error"] == "internal"
