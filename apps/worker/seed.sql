-- Local development seed data: one feed and one representative monitor.
-- Not applied to production. The RSS token below is a fixed local-only
-- value (sha256 of "local-dev-token") so `pnpm db:seed:local` stays
-- reproducible; rotate it via the admin UI before using outside dev.

INSERT INTO feeds (
  id, name, slug, kind, rss_token_hash, rss_token_prefix, rss_token_issued_at,
  rss_token_status, enabled, created_at, updated_at
) VALUES (
  'feed-seed-content', 'サンプルFeed', 'sample-feed', 'content',
  '2c624232cdd221771294dfbb310aca000a0df6ac8b66b696d90ef06fdefb64a',
  'local-dev-token', '2025-01-01T00:00:00.000Z', 'active', 1,
  '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'
);

INSERT INTO feeds (
  id, name, slug, kind, enabled, created_at, updated_at
) VALUES (
  'feed-seed-system', 'システム稼働通知', 'system', 'system', 1,
  '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'
);

INSERT INTO monitors (
  id, feed_id, name, url, monitor_mode, comparison_rule, enabled, order_index,
  created_at, updated_at
) VALUES (
  'monitor-seed-1', 'feed-seed-content', 'サンプル監視対象', 'http://localhost:4173/static.html',
  'single', 'normalized_equality', 1, 0, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'
);

INSERT INTO selections (
  id, monitor_id, label, selector_type, selector, extraction_mode, match_mode,
  order_index, created_at, updated_at
) VALUES (
  'selection-seed-1', 'monitor-seed-1', '見出し', 'css', '#headline', 'text', 'normalized',
  0, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'
);

INSERT INTO monitor_state (monitor_id, status, updated_at)
VALUES ('monitor-seed-1', 'UNCHECKED', '2025-01-01T00:00:00.000Z');
