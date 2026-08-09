export interface Env {
  DB: D1Database;
  ADMIN_LOGIN_SECRET: string;
  EXTENSION_API_TOKEN: string;
  RUNNER_API_TOKEN: string;
  SESSION_SIGNING_SECRET: string;
  ADMIN_SESSION_TTL_SEC: string;
  DEFAULT_HEARTBEAT_THRESHOLD_SEC: string;
  ADMIN_ALLOWED_ORIGIN: string;
  EXTENSION_ALLOWED_ORIGIN: string;
  /**
   * Test-only escape hatch for the localhost/private-hostname Monitor URL
   * guard (§13), so local integration tests can point Monitors at a local
   * fixture server. Unset in production wrangler.toml; must never be set
   * there.
   */
  ALLOW_PRIVATE_MONITOR_URLS?: string;
}
