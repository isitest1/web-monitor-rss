import type { Feed, Monitor, MonitorState, SystemState } from '@web-monitor/shared';
import { monitorStatusLabel } from '@web-monitor/shared';
import { layout } from './layout.js';
import { escapeHtml, escapeJs } from './escape.js';

export interface MonitorRow {
  monitor: Monitor;
  state: MonitorState | null;
  feedName: string;
}

function statusClass(status: string, enabled: boolean): string {
  if (!enabled) return 'muted';
  if (status === 'OK' || status === 'BASELINED' || status === 'CHANGED') return 'status-ok';
  if (status === 'UNCHECKED') return 'muted';
  return 'status-error';
}

function summarizeValue(state: MonitorState | null): string {
  if (!state?.currentValue || state.currentValue.length === 0) return '(未確認)';
  const parts = state.currentValue.slice(0, 2).map((v) => {
    const display = Array.isArray(v.displayValue) ? v.displayValue.join(', ') : v.displayValue;
    return `${v.label}: ${display}`;
  });
  const summary = parts.join(' / ');
  return summary.length > 80 ? `${summary.slice(0, 80)}...` : summary;
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

function healthBanner(state: SystemState): string {
  if (state.alertStatus === 'healthy') return '';
  return `<div class="card" style="border: 2px solid #c62828;">
    <strong class="status-error">稼働停止の疑い</strong>
    <p class="muted">Runnerの最終正常実行: ${escapeHtml(formatDate(state.lastRunnerSuccessAt))}</p>
  </div>`;
}

function feedSelect(monitor: Monitor, contentFeeds: Feed[]): string {
  const options = contentFeeds
    .map(
      (feed) =>
        `<option value="${escapeHtml(feed.id)}"${feed.id === monitor.feedId ? ' selected' : ''}>${escapeHtml(feed.name)}</option>`,
    )
    .join('');
  return `<select class="feed-select" data-id="${escapeHtml(monitor.id)}">${options}</select>`;
}

export function monitorsPage(
  rows: MonitorRow[],
  feeds: Feed[],
  systemState: SystemState,
  csrfToken: string,
): string {
  const contentFeeds = feeds.filter((f) => f.kind === 'content');
  const body = `
${healthBanner(systemState)}
<div class="card">
  <div style="display:flex; justify-content:space-between; align-items:center;">
    <h1>Watchlist</h1>
    <div>
      <a href="/feeds">Feed管理</a> ・
      <button class="secondary" id="logout-btn">ログアウト</button>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Monitor名</th><th>Feed</th><th>現在値</th><th>状態</th>
        <th>最終確認</th><th>最終成功</th><th>最終変更</th><th>連続失敗</th><th>操作</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map((row) => {
          const label = monitorStatusLabel(row.state?.status ?? 'UNCHECKED', row.monitor.enabled);
          const cls = statusClass(row.state?.status ?? 'UNCHECKED', row.monitor.enabled);
          return `<tr>
            <td>${escapeHtml(row.monitor.name)}</td>
            <td>${feedSelect(row.monitor, contentFeeds)}</td>
            <td>${escapeHtml(summarizeValue(row.state))}</td>
            <td class="${cls}">${escapeHtml(label)}</td>
            <td>${escapeHtml(formatDate(row.state?.lastCheckedAt ?? null))}</td>
            <td>${escapeHtml(formatDate(row.state?.lastSuccessAt ?? null))}</td>
            <td>${escapeHtml(formatDate(row.state?.lastChangedAt ?? null))}</td>
            <td>${row.state?.consecutiveFailures ?? 0}</td>
            <td>
              <a href="${escapeHtml(row.monitor.url)}" target="_blank" rel="noopener">元ページ</a> ・
              <a href="/monitors/${escapeHtml(row.monitor.id)}/history">履歴</a> ・
              <button class="secondary toggle-btn" data-id="${escapeHtml(row.monitor.id)}" data-enabled="${row.monitor.enabled}">${row.monitor.enabled ? '無効化' : '有効化'}</button>
            </td>
          </tr>`;
        })
        .join('')}
    </tbody>
  </table>
  ${rows.length === 0 ? '<p class="muted">監視対象がまだありません。Chrome拡張機能で選択して登録してください。</p>' : ''}
  <p class="muted">Feed列のプルダウンで、MonitorをどのRSS Feedに配信するか変更できます。</p>
</div>
<p class="muted">GitHub ActionsのworkflowをActions画面からworkflow_dispatchで手動実行すると、即時に確認できます。</p>
<script>
const csrfToken = '${escapeJs(csrfToken)}';
document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', headers: { 'x-csrf-token': csrfToken } });
  window.location.href = '/login';
});
document.querySelectorAll('.toggle-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-id');
    const enabled = btn.getAttribute('data-enabled') === 'true';
    const action = enabled ? 'disable' : 'enable';
    await fetch('/api/monitors/' + id + '/' + action, {
      method: 'POST',
      headers: { 'x-csrf-token': csrfToken },
    });
    window.location.reload();
  });
});
document.querySelectorAll('.feed-select').forEach((select) => {
  select.addEventListener('change', async () => {
    const id = select.getAttribute('data-id');
    await fetch('/api/monitors/' + id, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ feedId: select.value }),
    });
    window.location.reload();
  });
});
</script>
`;
  return layout('Watchlist', body);
}
