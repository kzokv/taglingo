ALTER TABLE member_preferences
  ADD COLUMN manual_entry_promotion TEXT NOT NULL DEFAULT 'after-5-seconds'
  CHECK (manual_entry_promotion IN (
    'after-3-seconds',
    'after-5-seconds',
    'after-10-seconds',
    'only-on-request'
  ));

ALTER TABLE member_preferences
  ADD COLUMN focused_price_behavior TEXT NOT NULL DEFAULT 'automatic'
  CHECK (focused_price_behavior IN ('automatic', 'confirm'));
