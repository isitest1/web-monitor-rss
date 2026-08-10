-- Adds per-Monitor execution source (server via GitHub Actions Runner, or
-- local via the Chrome extension opening a background tab) and a
-- configurable check interval, replacing the fixed once-daily assumption.
-- Existing rows default to the prior behavior: server-side, 24 hours.
ALTER TABLE monitors ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'server'
  CHECK (execution_mode IN ('server', 'local'));
ALTER TABLE monitors ADD COLUMN check_interval_sec INTEGER NOT NULL DEFAULT 86400
  CHECK (check_interval_sec >= 3600);
