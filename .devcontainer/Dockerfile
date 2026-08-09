FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates \
       curl \
       git \
       jq \
       openssl \
       sqlite3 \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

USER node
