INSERT INTO plans (id, code, title, monthly_quota, created_at)
VALUES
  ('00000000-0000-0000-0000-000000000101', 'free', 'Free', 1000, now()),
  ('00000000-0000-0000-0000-000000000102', 'pro', 'Pro', 100000, now())
ON CONFLICT (code) DO NOTHING;

INSERT INTO users (id, telegram_user_id, display_name, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  123456789,
  'Local Test User',
  now(),
  now()
)
ON CONFLICT (telegram_user_id) DO NOTHING;

INSERT INTO quizzes (id, owner_user_id, title, description, status, published_version, questions_json, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'Test Quiz',
  'Seed quiz for local/integration runs',
  'published',
  1,
  '[{"id":"q1","text":"2+2?","options":["3","4"],"correct_option_index":1}]'::jsonb,
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;
