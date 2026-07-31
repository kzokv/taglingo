CREATE TABLE IF NOT EXISTS taglingo_memberships (
  clerk_user_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended')),
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('member', 'administrator')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (clerk_user_id GLOB 'user_*')
);

CREATE TABLE IF NOT EXISTS member_preferences (
  clerk_user_id TEXT PRIMARY KEY,
  source_currency TEXT NOT NULL,
  target_currencies TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (clerk_user_id)
    REFERENCES taglingo_memberships (clerk_user_id)
    ON DELETE CASCADE,
  CHECK (json_valid(target_currencies)),
  CHECK (json_array_length(target_currencies) BETWEEN 1 AND 3)
);

CREATE TABLE IF NOT EXISTS member_fx_rate_limits (
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('actor', 'ip')),
  subject_hash TEXT NOT NULL,
  bucket_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (subject_kind, subject_hash, bucket_start)
);

CREATE INDEX IF NOT EXISTS member_fx_rate_limits_by_bucket
  ON member_fx_rate_limits (bucket_start);
