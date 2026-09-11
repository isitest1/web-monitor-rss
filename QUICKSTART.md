# Quickstart

Get your own private RSS-feed-from-any-webpage instance running in about 10 minutes. This is for people who just want to *use* the project. If you want to develop or modify it, see [SETUP.md](SETUP.md) instead.

You'll need a [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is enough) and a [GitHub account](https://github.com/join).

1. **Click the Deploy button** below. It copies this repository into a new repo on your own GitHub account and walks you through creating a Cloudflare Worker and D1 database for it.

   [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/isitest1/web-monitor-rss)

2. On the configuration screen, pick a Worker name (or keep the default) and click **Deploy**. Wait for it to finish.

3. Note the Worker URL it gives you — `https://<your-worker-name>.<your-subdomain>.workers.dev`. You'll need it in steps 5 and 7.

4. In the [Cloudflare dashboard](https://dash.cloudflare.com/) → Workers & Pages → your new Worker → **Settings → Variables and Secrets**, add these as *secrets* (or run the three commands below from a terminal with [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed and authenticated):

   ```bash
   openssl rand -base64 32 | npx wrangler secret put ADMIN_LOGIN_SECRET
   openssl rand -base64 32 | npx wrangler secret put EXTENSION_API_TOKEN
   openssl rand -base64 32 | npx wrangler secret put RUNNER_API_TOKEN
   openssl rand -base64 32 | npx wrangler secret put SESSION_SIGNING_SECRET
   ```

   Also update the `ADMIN_ALLOWED_ORIGIN`, `GITHUB_REPO_OWNER`, and `GITHUB_REPO_NAME` variables (same screen) to your actual Worker URL and your new repo's owner/name — the deployed copy starts with placeholder values for these.

5. In your new repo's **Settings → Secrets and variables → Actions**, add two repository secrets: `MONITOR_API_BASE_URL` (your Worker URL from step 3) and `RUNNER_API_TOKEN` (the value you generated in step 4).

6. In your repo's **Actions** tab, open the `daily-monitor` workflow and run it once manually (*Run workflow*). Confirm it finishes green — this is the scheduled Playwright runner that will check your monitors going forward.

7. Download the prebuilt Chrome extension from this repo's [latest release](https://github.com/isitest1/web-monitor-rss/releases/latest), unzip it, and load it via `chrome://extensions/` → *Developer mode* → *Load unpacked* (see the main [README](README.md#installing-the-chrome-extension-not-on-the-web-store) for details). Open its options page and enter your Worker URL and the `EXTENSION_API_TOKEN` value from step 4.

8. Open the extension on any page you want to watch, select an element, and save it as a Monitor. Then open your Worker URL in a browser, log in (the password is the `ADMIN_LOGIN_SECRET` value from step 4), and copy the Monitor's RSS URL into your feed reader.

That's it — the Worker's own hourly cron watches for the scheduler itself going silent, so once this is set up you shouldn't need to touch it again.

## Troubleshooting

- **The Deploy button's build failed on the pnpm workspace.** This repository is a pnpm monorepo; the root [`wrangler.toml`](wrangler.toml) and `deploy`/`build` scripts in the root `package.json` are what make the single-click deploy work without a full local checkout. If it still fails, please [open an issue](https://github.com/isitest1/web-monitor-rss/issues) with the build log — this is the single riskiest step in this whole flow and reports help fix it for the next person.
- **CORS errors from the Chrome extension or the admin page.** Double-check `ADMIN_ALLOWED_ORIGIN` (step 4) exactly matches your Worker's URL, with no trailing slash.
- **The daily-monitor workflow fails.** Check that both Actions secrets from step 5 are set and that `RUNNER_API_TOKEN` matches the value you put in the Worker's secrets in step 4 exactly (they must be the same string).
