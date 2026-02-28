CREATE TABLE IF NOT EXISTS room_chat_messages (
    id UUID PRIMARY KEY,
    room_id TEXT NOT NULL,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_room_chat_messages_room_created_at
    ON room_chat_messages (room_id, created_at DESC);
