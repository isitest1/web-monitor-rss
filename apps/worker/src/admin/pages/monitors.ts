import type { Monitor, MonitorState, SystemState } from '@web-monitor/shared';
import { monitorStatusLabel } from '@web-monitor/shared';
import { layout } from './layout.js';
import { escapeHtml, escapeJs } from './escape.js';

export interface MonitorFeedInfo {
  id: string;
  rssUrl: string | null;
  rssTokenStatus: string | null;
  itemCount: number;
}

export interface MonitorRow {
  monitor: Monitor;
  state: MonitorState | null;
  feed: MonitorFeedInfo;
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
  return `<div class="card alert-card">
    <strong class="status-error">稼働停止の疑い</strong>
    <p class="muted">Runnerの最終正常実行: ${escapeHtml(formatDate(state.lastRunnerSuccessAt))}</p>
  </div>`;
}

function systemFeedCard(systemFeedUrl: string | null): string {
  if (!systemFeedUrl) return '';
  return `<div class="card">
    <div class="top-bar">
      <div>
        <h2 style="margin-bottom:0;">システム稼働通知RSS</h2>
        <p class="muted" style="margin-top:0.2rem;">稼働警告・回復通知の配信専用Feedです。RSSリーダーに登録しておくことをおすすめします。</p>
      </div>
    </div>
    <div class="actions-row">
      <input type="text" readonly value="${escapeHtml(systemFeedUrl)}" class="rss-url" style="flex:1; min-width: 260px;" onclick="this.select()" />
      <a href="${escapeHtml(systemFeedUrl)}" target="_blank" rel="noopener">開く</a>
      <button class="secondary copy-btn" data-url="${escapeHtml(systemFeedUrl)}">コピー</button>
    </div>
  </div>`;
}

const CHECK_INTERVAL_PRESETS: Array<{ seconds: number; label: string }> = [
  { seconds: 3600, label: '1時間ごと' },
  { seconds: 10800, label: '3時間ごと' },
  { seconds: 21600, label: '6時間ごと' },
  { seconds: 43200, label: '12時間ごと' },
  { seconds: 86400, label: '24時間ごと（既定）' },
];

function executionModeSelect(monitor: Monitor): string {
  const options = [
    { value: 'server', label: 'サーバー（GitHub Actions）' },
    { value: 'local', label: 'ローカル（拡張機能）' },
  ]
    .map(
      (opt) =>
        `<option value="${opt.value}" ${monitor.executionMode === opt.value ? 'selected' : ''}>${opt.label}</option>`,
    )
    .join('');
  return `<select class="execution-mode-select" data-id="${escapeHtml(monitor.id)}">${options}</select>`;
}

function checkIntervalSelect(monitor: Monitor): string {
  const options = CHECK_INTERVAL_PRESETS.map(
    (preset) =>
      `<option value="${preset.seconds}" ${monitor.checkIntervalSec === preset.seconds ? 'selected' : ''}>${preset.label}</option>`,
  ).join('');
  return `<select class="check-interval-select" data-id="${escapeHtml(monitor.id)}">${options}</select>`;
}

function feedCell(feed: MonitorFeedInfo): string {
  if (feed.rssUrl) {
    return `<div class="actions-row">
      <a href="${escapeHtml(feed.rssUrl)}" target="_blank" rel="noopener" title="${escapeHtml(feed.rssUrl)}">RSSを見る</a>
      <button class="link copy-btn" data-url="${escapeHtml(feed.rssUrl)}">コピー</button>
    </div>`;
  }
  if (feed.rssTokenStatus === 'active') {
    return '<span class="muted">URL未記録（再発行で表示されます）</span>';
  }
  return '<span class="muted">失効済み</span>';
}

export function monitorsPage(
  rows: MonitorRow[],
  systemFeedUrl: string | null,
  systemState: SystemState,
  csrfToken: string,
): string {
  const body = `
${healthBanner(systemState)}
${systemFeedCard(systemFeedUrl)}
<div class="card">
  <div class="top-bar">
    <h1 style="margin-bottom:0;">Watchlist</h1>
    <button class="secondary" id="logout-btn">ログアウト</button>
  </div>
  <table class="table-align-top">
    <thead>
      <tr>
        <th>Monitor</th><th>現在値</th><th>RSS</th><th>確認設定</th><th>履歴</th><th>操作</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map((row) => {
          const label = monitorStatusLabel(row.state?.status ?? 'UNCHECKED', row.monitor.enabled);
          const cls = statusClass(row.state?.status ?? 'UNCHECKED', row.monitor.enabled);
          const failures = row.state?.consecutiveFailures ?? 0;
          return `<tr>
            <td>
              <div class="cell-stack">
                <strong>${escapeHtml(row.monitor.name)}</strong>
                <span class="${cls}">${escapeHtml(label)}</span>
              </div>
            </td>
            <td>${escapeHtml(summarizeValue(row.state))}</td>
            <td>
              <div class="cell-stack">
                ${feedCell(row.feed)}
                <span class="muted">${row.feed.itemCount}件</span>
              </div>
            </td>
            <td>
              <div class="field-row"><span class="field-label">方式</span>${executionModeSelect(row.monitor)}</div>
              <div class="field-row"><span class="field-label">間隔</span>${checkIntervalSelect(row.monitor)}</div>
            </td>
            <td>
              <div class="cell-stack">
                <div><span class="field-label">確認</span>${escapeHtml(formatDate(row.state?.lastCheckedAt ?? null))}</div>
                <div><span class="field-label">成功</span>${escapeHtml(formatDate(row.state?.lastSuccessAt ?? null))}</div>
                <div><span class="field-label">変更</span>${escapeHtml(formatDate(row.state?.lastChangedAt ?? null))}</div>
                <div><span class="field-label">失敗</span><span class="${failures > 0 ? 'status-error' : ''}">${failures}</span></div>
              </div>
            </td>
            <td>
              <div class="actions-grid">
                <a class="action-chip" href="${escapeHtml(row.monitor.url)}" target="_blank" rel="noopener">元ページ</a>
                <a class="action-chip" href="/monitors/${escapeHtml(row.monitor.id)}/history">履歴</a>
                ${
                  row.monitor.executionMode === 'local'
                    ? '<span class="action-chip disabled" title="ローカルモードのMonitorは拡張機能のポップアップから実行してください">確認は拡張機能で</span>'
                    : `<button class="action-chip check-btn" data-id="${escapeHtml(row.monitor.id)}">今すぐ確認</button>`
                }
                <button class="action-chip toggle-btn" data-id="${escapeHtml(row.monitor.id)}" data-enabled="${row.monitor.enabled}">${row.monitor.enabled ? '無効化' : '有効化'}</button>
                <button class="action-chip rotate-btn" data-feed-id="${escapeHtml(row.feed.id)}">トークン再発行</button>
                <button class="action-chip danger delete-btn" data-id="${escapeHtml(row.monitor.id)}" data-name="${escapeHtml(row.monitor.name)}">削除</button>
              </div>
            </td>
          </tr>`;
        })
        .join('')}
    </tbody>
  </table>
  ${rows.length === 0 ? '<p class="muted">監視対象がまだありません。Chrome拡張機能で選択して登録してください。</p>' : ''}
</div>
<p class="muted">RSS URLにはアクセス用のトークンが含まれています。他人に共有しないでください。</p>
<script>
const csrfToken = '${escapeJs(csrfToken)}';
document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', headers: { 'x-csrf-token': csrfToken } });
  window.location.href = '/login';
});
document.querySelectorAll('.check-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-id');
    const res = await fetch('/api/monitors/' + id + '/check', {
      method: 'POST',
      headers: { 'x-csrf-token': csrfToken },
    });
    if (res.status === 202) {
      alert('確認をリクエストしました。数分後にこの画面を更新すると結果が反映されます。');
    } else if (res.status === 503) {
      alert('この機能は未設定です（Worker側でGITHUB_DISPATCH_TOKENの設定が必要です）。GitHub ActionsのActions画面から手動実行してください。');
    } else {
      alert('確認のリクエストに失敗しました。しばらくしてから再度お試しください。');
    }
  });
});
document.querySelectorAll('.execution-mode-select').forEach((select) => {
  select.addEventListener('change', async () => {
    const id = select.getAttribute('data-id');
    await fetch('/api/monitors/' + id, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ executionMode: select.value }),
    });
    window.location.reload();
  });
});
document.querySelectorAll('.check-interval-select').forEach((select) => {
  select.addEventListener('change', async () => {
    const id = select.getAttribute('data-id');
    await fetch('/api/monitors/' + id, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ checkIntervalSec: Number(select.value) }),
    });
    window.location.reload();
  });
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
document.querySelectorAll('.delete-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-id');
    const name = btn.getAttribute('data-name');
    if (!confirm(name + ' を削除します。よろしいですか？（履歴も削除されます）')) return;
    await fetch('/api/monitors/' + id, {
      method: 'DELETE',
      headers: { 'x-csrf-token': csrfToken },
    });
    window.location.reload();
  });
});
document.querySelectorAll('.rotate-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const feedId = btn.getAttribute('data-feed-id');
    if (!confirm('現在のRSS URLは無効になり、新しいURLに置き換わります。よろしいですか？')) return;
    const res = await fetch('/api/feeds/' + feedId + '/rotate-token', {
      method: 'POST',
      headers: { 'x-csrf-token': csrfToken },
    });
    if (res.ok) window.location.reload();
  });
});
document.querySelectorAll('.copy-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    navigator.clipboard.writeText(btn.getAttribute('data-url'));
  });
});
</script>
`;
  return layout('Watchlist', body, { fullWidth: true });
}
