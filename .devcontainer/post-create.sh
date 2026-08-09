#!/usr/bin/env bash
set -euo pipefail

corepack enable
corepack prepare pnpm@10 --activate

if [ -f package.json ]; then
  pnpm install --frozen-lockfile=false
fi

npx --yes playwright@latest install --with-deps chromium
npx --yes wrangler@latest --version

# Use the host SSH agent when available. Do not copy private keys into the image.
if [ -S "${SSH_AUTH_SOCK:-}" ]; then
  echo "SSH agent is available."
fi

echo "Dev Container setup completed."
