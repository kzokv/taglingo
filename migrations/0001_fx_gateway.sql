CREATE TABLE IF NOT EXISTS fx_pair_records (
  source_currency TEXT NOT NULL,
  target_currency TEXT NOT NULL,
  decimal_value TEXT NOT NULL,
  provider TEXT NOT NULL,
  method TEXT NOT NULL,
  provider_published_date TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  attribution TEXT NOT NULL,
  etag TEXT,
  PRIMARY KEY (source_currency, target_currency),
  CHECK (source_currency <> target_currency),
  CHECK (decimal_value GLOB '[0-9]*' OR decimal_value GLOB '[0-9]*.[0-9]*'),
  CHECK (provider = 'Frankfurter'),
  CHECK (method = 'daily-blend')
);

CREATE TABLE IF NOT EXISTS guest_fx_rate_limits (
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('actor', 'ip')),
  subject_hash TEXT NOT NULL,
  bucket_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (subject_kind, subject_hash, bucket_start)
);

CREATE INDEX IF NOT EXISTS guest_fx_rate_limits_by_bucket
  ON guest_fx_rate_limits (bucket_start);

CREATE TABLE IF NOT EXISTS fx_revalidation_leases (
  source_currency TEXT NOT NULL,
  target_currency TEXT NOT NULL,
  lease_until INTEGER NOT NULL,
  PRIMARY KEY (source_currency, target_currency),
  CHECK (source_currency <> target_currency)
);
