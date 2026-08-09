-- Initial schema: feeds, monitors, selections, monitor_state, checks,
-- changes, system_state (heartbeat watchdog), admin_sessions.

CREATE TABLE feeds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('content', 'system')),
  rss_token_hash TEXT,
  rss_token_prefix TEXT,
  rss_token_issued_at TEXT,
  rss_token_last_used_at TEXT,
  rss_token_status TEXT CHECK (rss_token_status IN ('active', 'revoked')),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_feeds_rss_token_hash ON feeds (rss_token_hash);

CREATE TABLE monitors (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES feeds (id),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  monitor_mode TEXT NOT NULL CHECK (monitor_mode IN ('single', 'list')),
  comparison_rule TEXT NOT NULL DEFAULT 'normalized_equality',
  enabled INTEGER NOT NULL DEFAULT 1,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_monitors_feed_id ON monitors (feed_id);

CREATE TABLE selections (
  id TEXT PRIMARY KEY,
  monitor_id TEXT NOT NULL REFERENCES monitors (id),
  label TEXT NOT NULL,
  selector_type TEXT NOT NULL CHECK (selector_type IN ('css', 'document')),
  selector TEXT NOT NULL DEFAULT '',
  selector_candidates_json TEXT NOT NULL DEFAULT '[]',
  extraction_mode TEXT NOT NULL CHECK (
    extraction_mode IN ('text', 'html', 'attribute', 'link', 'image', 'list')
  ),
  attribute_name TEXT,
  normalization_json TEXT NOT NULL DEFAULT '{}',
  match_mode TEXT NOT NULL DEFAULT 'normalized',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_selections_monitor_id ON selections (monitor_id);

CREATE TABLE monitor_state (
  monitor_id TEXT PRIMARY KEY REFERENCES monitors (id),
  status TEXT NOT NULL DEFAULT 'UNCHECKED',
  current_value_json TEXT,
  current_hash TEXT,
  last_checked_at TEXT,
  last_success_at TEXT,
  last_changed_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_error_message TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE checks (
  id TEXT PRIMARY KEY,
  monitor_id TEXT NOT NULL REFERENCES monitors (id),
  run_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  http_status INTEGER,
  result_hash TEXT,
  error_code TEXT,
  error_message TEXT
);

CREATE INDEX idx_checks_monitor_started ON checks (monitor_id, started_at DESC);
CREATE INDEX idx_checks_run_id ON checks (run_id);

-- feed_id lets system-level events (no monitor_id) attach directly to the
-- system feed; monitor_id is nullable for that reason.
CREATE TABLE changes (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES feeds (id),
  monitor_id TEXT REFERENCES monitors (id),
  detected_at TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (
    change_type IN ('CHANGED', 'ADDED', 'UPDATED', 'REMOVED', 'SYSTEM_ALERT', 'SYSTEM_RECOVERY')
  ),
  old_value_json TEXT,
  new_value_json TEXT,
  changed_selection_ids_json TEXT NOT NULL DEFAULT '[]',
  change_fingerprint TEXT NOT NULL,
  guid TEXT NOT NULL UNIQUE,
  source_url TEXT,
  published INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_changes_feed_detected ON changes (feed_id, detected_at DESC);
CREATE INDEX idx_changes_monitor_detected ON changes (monitor_id, detected_at DESC);
-- Only content-monitor changes are deduplicated by fingerprint; system
-- alert/recovery de-duplication is handled via system_state.alert_status.
CREATE UNIQUE INDEX idx_changes_monitor_fingerprint ON changes (monitor_id, change_fingerprint)
WHERE monitor_id IS NOT NULL;

CREATE TABLE system_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_runner_run_at TEXT,
  last_runner_success_at TEXT,
  last_runner_run_id TEXT,
  heartbeat_threshold_sec INTEGER NOT NULL DEFAULT 93600,
  alert_status TEXT NOT NULL DEFAULT 'healthy' CHECK (alert_status IN ('healthy', 'stale')),
  active_alert_change_id TEXT REFERENCES changes (id),
  last_watchdog_checked_at TEXT,
  updated_at TEXT NOT NULL
);

INSERT INTO system_state (id, heartbeat_threshold_sec, alert_status, updated_at)
VALUES (1, 93600, 'healthy', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE admin_sessions (
  id TEXT PRIMARY KEY,
  session_token_hash TEXT NOT NULL UNIQUE,
  csrf_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  user_agent_hash TEXT
);

CREATE INDEX idx_admin_sessions_expires ON admin_sessions (expires_at);
