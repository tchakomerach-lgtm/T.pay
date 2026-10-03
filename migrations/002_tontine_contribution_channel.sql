ALTER TABLE tontine_contributions
  ADD COLUMN IF NOT EXISTS channel text;

UPDATE tontine_contributions
SET channel = 'mobile_money'
WHERE channel IS NULL;

ALTER TABLE tontine_contributions
  ALTER COLUMN channel SET NOT NULL;

ALTER TABLE tontine_contributions
  DROP CONSTRAINT IF EXISTS tontine_contributions_channel_check;

ALTER TABLE tontine_contributions
  ADD CONSTRAINT tontine_contributions_channel_check
  CHECK (channel IN ('agent','wallet','mobile_money','microfinance','cash_point','ussd'));
