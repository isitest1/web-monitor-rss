import type { Env as WorkerEnv } from './env.js';

// Augments the ambient `Cloudflare.Env` namespace that
// `@cloudflare/vitest-pool-workers`'s `cloudflare:test` module types its
// exported `env` against, so tests get our actual bindings without casts.
declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}

export {};
