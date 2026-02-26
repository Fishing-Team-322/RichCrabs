ALTER TABLE users
    ADD COLUMN IF NOT EXISTS plan_code TEXT REFERENCES plans(code);

UPDATE users
SET plan_code = 'free'
WHERE plan_code IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_plan_code ON users(plan_code);

ALTER TABLE usage_counters
    ADD COLUMN IF NOT EXISTS rooms_created INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS rooms_started INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS bots_registered INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ai_jobs_started INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS quizzes_created_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS messages_sent_count INTEGER NOT NULL DEFAULT 0;

UPDATE usage_counters
SET
    quizzes_created_count = quizzes_created,
    messages_sent_count = messages_sent
WHERE quizzes_created_count = 0
  AND messages_sent_count = 0
  AND (quizzes_created <> 0 OR messages_sent <> 0);
