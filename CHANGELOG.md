# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project is deployed continuously to a single live instance rather than
published as versioned releases, so entries are grouped by date instead of
a version number.

## [Unreleased]

## 2026-08-12

### Added

- RSS item titles for a list-mode Selection gaining a new entry (e.g. a
  news/blog listing) now use that entry's own leading date and headline —
  e.g. "Monitor Name: 2024-01-15 Headline" — instead of a generic "Changed",
  when a leading date can be recognized. Single-value Selections are
  unaffected and keep the plain "Monitor Name - Changed" title; list items
  without a recognizable leading date also fall back to it.
- `text`-mode Selections now automatically capture absolute URLs of any
  `<img>` elements within the selected range (up to 5, deduplicated) and
  render them, linked back to the source page, in the RSS description and
  the admin history page. Display-only: image URLs are never part of the
  comparison value, so images changing alone never triggers a notification.
- Line breaks in the source markup (e.g. between list items or paragraphs)
  are now preserved in displayed and RSS-published values instead of being
  collapsed into one run-on line; comparison values are unaffected, so
  reformatting-only differences still don't look like a content change.
- RSS `<ttl>` and `sy:updatePeriod`/`sy:updateFrequency` hints, derived from
  each feed's fastest enabled Monitor, to nudge RSS readers toward polling
  sooner. This is a best-effort signal — most cloud readers (Inoreader
  included) use their own adaptive crawl schedule and may not honor it.
- Public README with a feature comparison against similar open-source
  projects, and an MIT license.

## 2026-08-11

### Added

- Selector editing, Watchlist bulk actions and grouping, and list-diff
  (added/removed items) display.
- Scalar text diffs now show only the changed portion in context instead of
  the full before/after value.
- All user-facing UI text translated to English.

### Fixed

- The edit-Monitor tab flow now runs from the background service worker
  instead of the popup, since Chrome kills an MV3 popup's JS on focus loss.
- Content scripts granted access to `chrome.storage.session`.

### Security

- Removed the hardcoded Extension API token and personally-identifying
  config (Cloudflare subdomain, D1 database ID, extension ID, GitHub
  owner/repo) from the extension source and `wrangler.toml`. The extension
  now requires one-time setup via its options page; real deployment values
  now live only in a gitignored `wrangler.production.toml`, never committed.

## 2026-08-10

### Added

- Local (Chrome extension background tab) execution mode alongside
  server-side (GitHub Actions), selectable per Monitor, plus a per-Monitor
  check interval.
- Manual per-Monitor check trigger, Watchlist search/sort and filtering by
  execution mode, and RSS item counts.
- Secret scanning (gitleaks) wired into CI.

### Changed

- Reworked the Watchlist layout based on feedback: grouped related fields,
  decluttered actions, moved the system feed card to the bottom.
- Extended the admin session TTL to 1 year, appropriate for this
  single-user deployment.

### Fixed

- The first successful check after prior failures is now treated as a new
  baseline rather than recorded as a content change.
- Admin session cookie changed from `SameSite=Strict` to `SameSite=Lax` so
  navigating in from the extension popup still carries the session.
- Admin HTML pages now send `Cache-Control: no-store`.

## 2026-08-09

### Added

- Initial build: TypeScript pnpm monorepo with shared Zod schemas; the
  Cloudflare Worker API (admin/extension/runner authentication, RSS token
  issuance/rotation/revocation, change detection, heartbeat watchdog); the
  Playwright Runner; a CSS selector engine with candidate scoring and
  keyboard navigation; the Chrome Manifest V3 extension with the Visual
  Selector overlay; admin Watchlist, Feed, and Monitor-history pages; and
  the daily GitHub Actions monitoring workflow.
- End-to-end test covering Selection definition through to a published RSS
  item.

### Fixed

- CORS preflight (`OPTIONS`) responses were missing their headers, breaking
  the extension's `fetch()` calls.
- The Chrome extension's ID is now pinned via a fixed `manifest.json` key
  so it stays identical across machines.
