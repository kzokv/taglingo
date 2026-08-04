CREATE TABLE IF NOT EXISTS recognition_health_operator_audit (
  requested_at TEXT NOT NULL,
  operator TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN (
    'reliability',
    'regression',
    'error-health',
    'camera-supported-evidence'
  )),
  from_day TEXT NOT NULL,
  through_day TEXT NOT NULL,
  CHECK (requested_at GLOB
    '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  CHECK (operator GLOB 'user_*'),
  CHECK (from_day GLOB
    '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  CHECK (through_day GLOB
    '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);

CREATE INDEX IF NOT EXISTS recognition_health_audit_by_expiry
  ON recognition_health_operator_audit (requested_at);
