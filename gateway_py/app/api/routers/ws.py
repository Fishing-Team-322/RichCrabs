import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import grpc
from app.api.dependencies.auth import session_from_req
from app.config import settings
from app.grpc_clients.core import clients, map_grpc_err
from app.mappers.event_mapper import room_event_to_dict
from app.proto_gen import common_pb2, game_pb2

router = APIRouter(tags=['ws'])

@router.websocket('/ws')
async def ws(ws: WebSocket):
    await ws.accept()
    s = session_from_req(ws)  # type: ignore[arg-type]
    if not s:
        token = ws.cookies.get(settings.session_cookie_name) or ws.query_params.get('joinTicket')
        from app.security import verify_session_token
        s = verify_session_token(token) if token else None
    if not s or not s.room_id:
        await ws.close(); return
    await ws.send_json({'type': 'hello', 'roomId': s.room_id, 'role': s.role})

    def _next_stream_event(stream):
        try: return next(stream)
        except StopIteration: return None

    async def events_loop():
        req = game_pb2.SubscribeRoomEventsRequest(room_id=common_pb2.RoomId(value=s.room_id))
        if s.player_id: req.subscriber_player_id.value = s.player_id
        try:
            stream = iter(clients.game.SubscribeRoomEvents(req))
            while True:
                ev = await asyncio.to_thread(_next_stream_event, stream)
                if ev is None: return
                await ws.send_json({'type': 'room_event', 'event': room_event_to_dict(ev)})
        except grpc.RpcError as ex:
            try:
                c, b = map_grpc_err(ex, 'subscribe_room_events')
            except Exception:
                c, b = 500, {'error': 'internal', 'message': 'room event stream failed'}
            await ws.send_json({'type': 'error', 'error': b.get('error', 'grpc_error'), 'message': b.get('message', 'room event stream failed'), 'details': {'status': c}})

    events_task = asyncio.create_task(events_loop())
    try:
        while True:
            msg = await ws.receive_json()
            if msg.get('type') == 'ping': await ws.send_json({'type': 'pong'})
            elif msg.get('type') == 'get_state':
                g = clients.game.GetRoomState(game_pb2.GetRoomStateRequest(room_id=common_pb2.RoomId(value=s.room_id)))
                await ws.send_json({'type': 'room_state', 'room_id': g.room_id.value, 'state': g.state, 'players': [{'player_id': p.player_id.value, 'display_name': p.display_name, 'score': p.score} for p in g.players]})
            else:
                await ws.send_json({'type': 'error', 'error': 'unsupported_message_type', 'message': 'unsupported client message type'})
    except WebSocketDisconnect:
        pass
    finally:
        if not events_task.done(): events_task.cancel()
        try: await events_task
        except Exception: pass
