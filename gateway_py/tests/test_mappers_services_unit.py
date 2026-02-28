from app.mappers.room_mapper import settings_to_dict
from app.services.game_service import resolve_host_room


def test_settings_to_dict_defaults():
    mapped = settings_to_dict(None)
    assert mapped['privacy'] == 'private'
    assert mapped['playerLimit'] == 20


def test_resolve_host_room_returns_none_on_missing(fake_clients):
    assert resolve_host_room('u1', '000000') is None
