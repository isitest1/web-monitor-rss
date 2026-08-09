import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('D1 migrations', () => {
  it('create all required tables against an empty database', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'",
    ).all<{ name: string }>();
    const tableNames = results.map((row) => row.name).sort();
    expect(tableNames).toEqual(
      [
        'admin_sessions',
        'changes',
        'checks',
        'feeds',
        'monitor_state',
        'monitors',
        'selections',
        'system_state',
      ].sort(),
    );
  });

  it('seeds a single system_state row with healthy defaults', async () => {
    const row = await env.DB.prepare('SELECT * FROM system_state WHERE id = 1').first<{
      alert_status: string;
      heartbeat_threshold_sec: number;
    }>();
    expect(row?.alert_status).toBe('healthy');
    expect(row?.heartbeat_threshold_sec).toBe(93600);
  });
});
