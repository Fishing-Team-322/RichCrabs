CREATE TABLE IF NOT EXISTS bots (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    telegram_bot_id BIGINT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    token_encrypted TEXT NOT NULL,
    webhook_secret TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
