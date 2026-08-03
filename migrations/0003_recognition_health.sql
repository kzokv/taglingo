CREATE TABLE IF NOT EXISTS recognition_health_daily_aggregates (
  aggregate_day TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  release TEXT NOT NULL CHECK (release = '0.1.0'),
  platform TEXT NOT NULL
    CHECK (platform IN ('ios-safari', 'android-chrome', 'other')),
  source_currency TEXT NOT NULL,
  time_to_ready TEXT NOT NULL
    CHECK (time_to_ready IN (
      'not-reached', 'under-1s', '1-to-5s', '5-to-15s', '15-to-30s', 'over-30s'
    )),
  time_to_first_detected_price TEXT NOT NULL
    CHECK (time_to_first_detected_price IN (
      'not-reached', 'under-1s', '1-to-5s', '5-to-15s', '15-to-30s', 'over-30s'
    )),
  time_to_first_focused_price TEXT NOT NULL
    CHECK (time_to_first_focused_price IN (
      'not-reached', 'under-1s', '1-to-5s', '5-to-15s', '15-to-30s', 'over-30s'
    )),
  recognition_pass_count TEXT NOT NULL
    CHECK (recognition_pass_count IN ('0', '1', '2-to-5', '6-to-20', 'over-20')),
  miss_count TEXT NOT NULL
    CHECK (miss_count IN ('0', '1', '2-to-5', '6-to-20', 'over-20')),
  focus_change_count TEXT NOT NULL
    CHECK (focus_change_count IN ('0', '1', '2-to-5', '6-to-20', 'over-20')),
  stable_detection_count TEXT NOT NULL
    CHECK (stable_detection_count IN ('0', '1', '2-to-5', '6-to-20', 'over-20')),
  terminal_outcome TEXT NOT NULL CHECK (terminal_outcome IN (
    'focused-price-obtained',
    'entered-price-before-promotion',
    'entered-price-after-promotion',
    'closed-without-price',
    'camera-permission-denied',
    'camera-unavailable-or-interrupted',
    'recognition-initialization-failed',
    'recognition-ended-without-stable-price',
    'unexpected-recognition-failure'
  )),
  error_family TEXT NOT NULL CHECK (error_family IN (
    'none',
    'camera-permission',
    'camera-unavailable',
    'camera-interrupted',
    'recognition-initialization',
    'recognition-runtime',
    'unexpected'
  )),
  summary_count INTEGER NOT NULL CHECK (summary_count > 0),
  PRIMARY KEY (
    aggregate_day, schema_version, release, platform, source_currency,
    time_to_ready, time_to_first_detected_price, time_to_first_focused_price,
    recognition_pass_count, miss_count, focus_change_count,
    stable_detection_count, terminal_outcome, error_family
  ),
  CHECK (aggregate_day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  CHECK (length(source_currency) = 3)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS recognition_health_aggregates_by_expiry
  ON recognition_health_daily_aggregates (aggregate_day);
