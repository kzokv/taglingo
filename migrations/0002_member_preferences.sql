CREATE TABLE IF NOT EXISTS taglingo_memberships (
  clerk_user_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended')),
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
