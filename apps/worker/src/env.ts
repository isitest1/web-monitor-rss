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
   * Optional: lets a newly created Monitor trigger an immediate GitHub
   * Actions run (scoped to just that Monitor) instead of waiting for the
   * next scheduled/manual run. If GITHUB_DISPATCH_TOKEN is unset, this
   * feature is silently disabled.
   */
  GITHUB_DISPATCH_TOKEN?: string;
  GITHUB_REPO_OWNER?: string;
  GITHUB_REPO_NAME?: string;
  GITHUB_WORKFLOW_FILE?: string;
  GITHUB_REPO_REF?: string;
  /**
   * Test-only escape hatch for the localhost/private-hostname Monitor URL
   * guard (§13), so local integration tests can point Monitors at a local
   * fixture server. Unset in production wrangler.toml; must never be set
   * there.
   */
  ALLOW_PRIVATE_MONITOR_URLS?: string;
}
