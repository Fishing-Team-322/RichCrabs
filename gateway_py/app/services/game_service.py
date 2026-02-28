from app.grpc_clients.core import clients
from app.mappers.room_mapper import map_room_snapshot
from app.proto_gen import common_pb2, game_pb2


def list_rooms(owner_user_id: str = "", include_public: bool = False):
    req_kwargs = {"limit": 50, "include_public": include_public}
    if owner_user_id:
        req_kwargs["owner_user_id"] = common_pb2.UserId(value=owner_user_id)
    req = game_pb2.ListRoomsRequest(**req_kwargs)
    return [map_room_snapshot(room) for room in clients.game.ListRooms(req).rooms]


def resolve_host_room(user_id: str, pin: str):
    for room in list_rooms(owner_user_id=user_id, include_public=True):
        if room["pin"] == pin:
            return room
    return None
