CREATE TABLE IF NOT EXISTS ai_quiz_jobs (
    id UUID PRIMARY KEY,
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    desired_question_count INTEGER,
    status TEXT NOT NULL,
    result_quiz_json JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_quiz_jobs_status_check CHECK (status IN ('queued', 'running', 'done', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_ai_quiz_jobs_owner_user_id ON ai_quiz_jobs(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_ai_quiz_jobs_status ON ai_quiz_jobs(status);
