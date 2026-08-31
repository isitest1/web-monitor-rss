-- Per-Monitor choice of how a change's description is rendered in RSS/admin:
-- 'both' keeps showing old and new values (Added/Removed for list-mode),
-- 'new_only' shows only the new value (just the added items for list-mode,
-- with no "Added:" prefix; the new value as-is for scalar-mode). Existing
-- rows default to the prior behavior.
ALTER TABLE monitors ADD COLUMN change_display_mode TEXT NOT NULL DEFAULT 'both'
  CHECK (change_display_mode IN ('both', 'new_only'));
