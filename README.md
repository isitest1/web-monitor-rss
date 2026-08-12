# Web Monitor RSS

**Visually select any part of any webpage — even one with no feed of its own — and get a private RSS feed of what changes.**

A point-and-click "Distill"-style selector picks the exact element (or elements) you care about. A serverless backend on Cloudflare checks it on a schedule you set, and a GitHub Actions runner (or, if you prefer, your own Chrome browser) does the actual page fetch with Playwright. Nothing needs to stay running on your machine, and if the checker itself ever goes quiet, a second, independent watchdog notices and tells you.

[![CI](https://github.com/isitest1/web-monitor-rss/actions/workflows/ci.yml/badge.svg)](https://github.com/isitest1/web-monitor-rss/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](LICENSE)

> **Status:** this is a personal, single-user project — see [Scope](#scope) before deciding whether it fits your use case.

---

## Table of contents

- [Why this exists](#why-this-exists)
- [How it compares](#how-it-compares)
- [What makes it different](#what-makes-it-different)
- [Features](#features)
- [Architecture](#architecture)
- [Quick start](#quick-start)
- [Installing the Chrome extension (not on the Web Store)](#installing-the-chrome-extension-not-on-the-web-store)
- [Usage](#usage)
- [Security & privacy principles](#security--privacy-principles)
- [Tech stack](#tech-stack)
- [Development](#development)
- [Scope](#scope)
- [License](#license)

## Why this exists

Most pages worth watching for changes — a pricing row, a single line in a government notice, one product's stock status, a change-log entry — don't publish an RSS feed for that specific thing, and often no feed at all. Existing "page-to-RSS" tools generally ask you to either write a CSS/XPath selector by hand, or run a server (Docker container, PHP host, Rails app) that has to stay online 24/7 to keep checking. This project is built around two different premises: picking the right part of a page should be as easy as hovering and clicking, and keeping it monitored shouldn't require you to keep anything running yourself.

## How it compares

| | **web-monitor-rss** | [changedetection.io](https://github.com/dgtlmoon/changedetection.io) | [rss-bridge](https://github.com/RSS-Bridge/rss-bridge) | [huginn](https://github.com/huginn/huginn) | [urlwatch](https://github.com/thp/urlwatch) |
|---|---|---|---|---|---|
| Hosting | Serverless (Cloudflare Workers + D1 + GitHub Actions) — nothing to keep running | Self-hosted always-on (Docker/pip), or paid SaaS | Self-hosted always-on (PHP) | Self-hosted always-on (Rails) | Runs on your own cron |
| Visual point-and-click selector | Yes — hover highlight, click, `Enter`/`Escape`, `↑`/`↓`/`←`/`→` for parent/child/sibling, multiple labeled selections per monitor | Yes, via an optional Playwright fetcher | No — CSS/XPath typed by hand | No — CSS selectors configured per agent | No — CLI/YAML config |
| RSS output | Yes, per feed, with rotatable tokens and stable GUIDs | Yes, per watch | Yes (its core purpose) | Possible via its agent graph | No |
| Watches its own scheduler for silent failure | Yes — an independent Cloudflare Worker cron checks the runner's last-success time and raises a separate alert feed if it goes stale | Not documented | Not applicable (on-demand generation, not scheduled diffing) | Not documented | Not applicable |
| Per-item choice of *where* the check runs | Yes — GitHub Actions or your own browser, set per monitor | No | No | No | No |

This table reflects each project's public documentation as of this writing, not a full audit of their source — see their repos for authoritative details. changedetection.io in particular is a mature, popular, actively maintained project (30k+ stars) and the closest comparison; if you're fine running a server yourself and don't need a GitHub-Actions/serverless setup, it's worth a look.

## What makes it different

- **Nothing has to stay running.** The whole backend — API, admin dashboard, RSS delivery, database — lives on Cloudflare Workers and D1, which don't require you to keep a laptop, VPS, or Docker host powered on. Scheduled checks run on GitHub Actions' free tier, not on your machine.
- **A watchdog for the watchdog.** GitHub Actions schedules are known to silently stop firing (inactive-repo throttling, quota changes, workflow file typos) without any obvious signal. A Cloudflare Worker Cron Trigger, running completely independently of GitHub Actions, checks the last successful run time and raises a system-feed alert — separate from your content-change feed — if monitoring itself has gone quiet. Every competitor surveyed above documents what happens when a *watched page* fails to fetch, but none document what happens when the *checker* itself dies.
- **Pick your execution venue per monitor.** Some monitors can run server-side on GitHub Actions; others — pages you only want checked while your own browser is open, or that you'd rather not route through a third-party runner — can run instead as a background tab in your own Chrome, on the same interval logic. No other project in the comparison offers this as a per-item setting.
- **Selector failures are reported, never silently patched over.** If a selector stops matching, it's recorded as `SELECTOR_NOT_FOUND` and surfaced to you — the system will never guess and silently start tracking a different element instead.
- **Deliberately minimal data retention.** Full page HTML, cookies, and login sessions are never stored; only the specific extracted values and their history. There is no CAPTCHA/bot-detection evasion and no stealth browser fingerprinting — if a site blocks automated access, that's reported as `BLOCKED`, not worked around.

## Features

- Chrome Manifest V3 extension with a Distill-style Visual Selector: hover highlighting, click to select, keyboard navigation to parent/child/previous-sibling/next-sibling elements, multiple labeled selections per monitor, single-element and repeating-list modes.
- Automatic CSS selector generation and scoring (stable ids and `data-*` attributes preferred; auto-generated-looking hashes/UUIDs/timestamps penalized), with every candidate verified against the live page before use.
- Text, HTML (size-capped, opt-in), attribute, link, image, and ordered-list extraction, with configurable normalization (whitespace, numeric/price parsing, regex, fixed-string stripping, case-insensitive comparison).
- Per-monitor check interval (default once a day, minimum once an hour) and execution mode (GitHub Actions server-side, or a local Chrome background tab).
- Baseline-on-first-success semantics: the first successful check sets the baseline and never generates a change item by itself; only real, deduplicated changes do.
- Full check/change history, current-state tracking, and per-monitor error state (`SELECTOR_NOT_FOUND`, `BLOCKED`, `RATE_LIMITED`, `TIMEOUT`, and more) — failed checks never overwrite the last known-good value or get recorded as a content change.
- RSS 2.0 output per feed with stable GUIDs, `ETag`/`Last-Modified`/304 support, and rotatable, hashed (never plaintext-stored) delivery tokens.
- A separate system feed for operational alerts: consecutive check failures, and the independent heartbeat watchdog's stale/recovered events — never mixed into your content-change feed.
- Cookie-session-protected admin dashboard (Watchlist) for managing monitors, groups, execution mode, check intervals, bulk actions, manual re-checks, and RSS token rotation/revocation — separate auth from the extension's and the runner's own tokens.

## Architecture

```
Chrome extension (Visual Selector, Watchlist popup)
        |  registers Monitors / runs execution_mode=local checks from a background tab
        v
Cloudflare Worker API + admin dashboard  <---  GitHub Actions + Playwright
        |                                        (execution_mode=server checks,
        v                                         hourly schedule, Worker decides
Cloudflare D1                                     what's actually due)
        ^
        |  independent watchdog: reads last-success timestamp only,
        |  never contacts monitored sites
Cloudflare Worker Cron (heartbeat)

RSS reader  --->  Cloudflare Worker RSS endpoint
```

See [CLAUDE.md](CLAUDE.md) for the full technical specification this project is built against (data model, API surface, security requirements, test coverage — it's written as the project's own source of truth and is kept accurate).

## Quick start

Full step-by-step setup (Dev Container, Cloudflare D1/Worker, GitHub secrets, RSS token flow, heartbeat verification) lives in **[SETUP.md](SETUP.md)**. In short:

1. Open the repo in the provided Dev Container (Node.js, pnpm, Playwright, and Wrangler are preinstalled there — nothing to install on your host machine).
2. `wrangler login`, create a D1 database, and fill in `apps/worker/wrangler.production.toml` (copied from the placeholder `apps/worker/wrangler.toml`) with your own database ID, allowed origins, and GitHub repo — see [SETUP.md §7](SETUP.md#7-cloudflare-d1の作成) for why the two files are split.
3. Generate and register the Admin/Extension/Runner secrets with `wrangler secret put`.
4. `pnpm --filter @web-monitor/worker run deploy:production` to deploy the Worker; add `MONITOR_API_BASE_URL` and `RUNNER_API_TOKEN` as GitHub Actions secrets so the daily workflow can reach it.
5. Build and load the Chrome extension — see the next section, this part is manual.

## Installing the Chrome extension (not on the Web Store)

**This extension is not published on the Chrome Web Store.** You install it yourself as an unpacked extension, and you'll need to repeat this on every machine you use it from:

1. Build it:
   ```
   pnpm --filter @web-monitor/extension build
   ```
   This produces `apps/extension/dist/`.
2. In Chrome, go to `chrome://extensions/`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `apps/extension/dist` folder.
5. Pin the extension to your toolbar.
6. Open the extension's **options page** and enter your Worker's API base URL and your Extension API token (generated in [Quick start](#quick-start) step 3). Neither of these ships with the extension by default — you must configure them the first time before anything else will work.
7. Note the extension ID Chrome assigns it (shown on `chrome://extensions/`), and confirm it matches `EXTENSION_ALLOWED_ORIGIN` in `apps/worker/wrangler.production.toml` — a mismatch is rejected by CORS. (This repo pins a stable ID via a public key in `apps/extension/manifest.json`, so the same built `dist/` gets the same ID on every machine; you shouldn't need to update this more than once.)

Because it's unpacked and not store-distributed, Chrome won't auto-update it — after pulling changes, re-run the build step and click the refresh icon for the extension on `chrome://extensions/`.

## Usage

**Creating a monitor:**
1. Open the extension popup on the page you want to watch and start Visual Selector mode.
2. Hover to preview candidate elements (highlighted without altering the page); click to select one, or use `↑` to move to its parent, `↓` to return to the child you came from, `←`/`→` for siblings, and `Enter` to confirm.
3. Repeat to add more labeled selections to the same monitor, or use the special "whole page" selection for full-page monitoring instead of a CSS selector.
4. Choose an extraction mode per selection (text, HTML, attribute, link, image, or list) and review the live preview and normalized comparison value before saving.
5. Set the monitor's name, feed, check interval (default 24h, minimum 1h), and execution mode (server via GitHub Actions, or local via your browser), then save — this registers it with the Worker API.

**Day to day:** open the admin dashboard (Watchlist) to see current status, current value, last checked/success/changed times, consecutive failure counts, and to toggle enabled/disabled, edit interval/execution mode/group, trigger a manual check, or bulk-edit multiple monitors at once. Subscribe to a monitor's feed's RSS URL in your reader of choice; each detected change becomes one item with the old and new value. Operational issues (repeated check failures, the heartbeat watchdog going stale or recovering) show up as a separate system feed, not mixed into content changes. Rotate or revoke a feed's RSS token from the dashboard at any time — the old token stops working immediately, and revoking without rotating just turns delivery off. `/health` reports the watchdog's own `healthy`/`stale` verdict and last successful run time.

## Security & privacy principles

- No CAPTCHA or bot-detection evasion, and no stealth browser fingerprinting — a site that blocks automated access is reported as `BLOCKED`, not worked around.
- No full-page HTML, cookies, or authenticated sessions are ever stored — only the specific values you selected, and only their history.
- Selectors that stop matching are reported as `SELECTOR_NOT_FOUND`, never silently repointed at a different element.
- Three separate credential types (admin dashboard session, Extension API token, Runner API token) that are never interchangeable, plus hashed (never plaintext-stored) RSS delivery tokens.
- This project targets only public, unauthenticated pages — it is not designed or intended for monitoring anything behind a login.

## Tech stack

TypeScript (strict) monorepo managed with pnpm workspaces · Chrome Manifest V3 · Playwright + Chromium · Cloudflare Workers (incl. Cron Triggers) · Cloudflare D1 · Wrangler · Hono · Zod for runtime validation at every API boundary · Vitest · Playwright Test · ESLint · Prettier.

## Development

```
pnpm install
pnpm dev          # run everything in watch mode
pnpm run ci        # format check, lint, typecheck, unit tests, build, e2e
```

See [CLAUDE.md](CLAUDE.md) for the full engineering ground rules this project follows (test coverage requirements, data model, API contracts), [SETUP.md](SETUP.md) for environment setup, and [CHANGELOG.md](CHANGELOG.md) for a history of notable changes.

## Scope

This is a **personal, single-user** project by design — no multi-tenant accounts, no billing, no general public sign-up. It monitors only public pages that don't require login. If you deploy it yourself, you get your own isolated Cloudflare/GitHub/D1 stack; nothing is shared with anyone else's deployment. Issues and pull requests are welcome, but this isn't run as a hosted service for others to sign up to.

## License

[MIT](LICENSE)
