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

// Used only for the "状態" sort-trigger, so clicking it surfaces the
// monitors that most need attention (failing) first.
function statusSortPriority(cls: string, enabled: boolean): number {
  if (cls === 'status-error') return 1;
  if (cls === 'status-ok') return 2;
  if (enabled) return 3; // UNCHECKED
  return 4; // disabled
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
<div class="card">
  <div class="top-bar">
    <h1 style="margin-bottom:0;">Watchlist</h1>
    <div class="actions-row">
      <input type="text" id="monitor-search" placeholder="Monitor名・URLで検索" style="width:240px;" />
      <button class="secondary" id="logout-btn">ログアウト</button>
    </div>
  </div>
  <table class="table-align-top" id="watchlist-table">
    <thead>
      <tr>
        <th class="sort-trigger" data-sort-key="name">Monitor</th><th>現在値</th><th>RSS</th><th>確認設定</th><th>履歴</th><th>操作</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map((row) => {
          const label = monitorStatusLabel(row.state?.status ?? 'UNCHECKED', row.monitor.enabled);
          const cls = statusClass(row.state?.status ?? 'UNCHECKED', row.monitor.enabled);
          const failures = row.state?.consecutiveFailures ?? 0;
          const lastCheckedAt = row.state?.lastCheckedAt ?? '';
          const lastSuccessAt = row.state?.lastSuccessAt ?? '';
          const lastChangedAt = row.state?.lastChangedAt ?? '';
          const searchHaystack = `${row.monitor.name} ${row.monitor.url}`.toLowerCase();
          return `<tr
            data-name="${escapeHtml(row.monitor.name)}"
            data-search="${escapeHtml(searchHaystack)}"
            data-status-priority="${statusSortPriority(cls, row.monitor.enabled)}"
            data-execution-mode="${escapeHtml(row.monitor.executionMode)}"
            data-check-interval="${row.monitor.checkIntervalSec}"
            data-last-checked="${escapeHtml(lastCheckedAt)}"
            data-last-success="${escapeHtml(lastSuccessAt)}"
            data-last-changed="${escapeHtml(lastChangedAt)}"
            data-failures="${failures}"
          >
            <td>
              <div class="cell-stack">
                <strong>${escapeHtml(row.monitor.name)}</strong>
                <span class="${cls} sort-trigger" data-sort-key="statusPriority" title="クリックで状態順に並び替え">${escapeHtml(label)}</span>
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
              <div class="field-row"><span class="field-label sort-trigger" data-sort-key="executionMode">方式</span>${executionModeSelect(row.monitor)}</div>
              <div class="field-row"><span class="field-label sort-trigger" data-sort-key="checkInterval">間隔</span>${checkIntervalSelect(row.monitor)}</div>
            </td>
            <td>
              <div class="cell-stack">
                <div><span class="field-label sort-trigger" data-sort-key="lastChecked">確認</span>${escapeHtml(formatDate(row.state?.lastCheckedAt ?? null))}</div>
                <div><span class="field-label sort-trigger" data-sort-key="lastSuccess">成功</span>${escapeHtml(formatDate(row.state?.lastSuccessAt ?? null))}</div>
                <div><span class="field-label sort-trigger" data-sort-key="lastChanged">変更</span>${escapeHtml(formatDate(row.state?.lastChangedAt ?? null))}</div>
                <div><span class="field-label sort-trigger" data-sort-key="failures">失敗</span><span class="${failures > 0 ? 'status-error' : ''}">${failures}</span></div>
              </div>
            </td>
            <td>
              <div class="actions-grid">
                <a class="action-chip" href="${escapeHtml(row.monitor.url)}" target="_blank" rel="noopener">元ページ</a>
                <a class="action-chip" href="/monitors/${escapeHtml(row.monitor.id)}/history">履歴</a>
                ${
                  row.monitor.executionMode === 'local'
                    ? '<span class="action-chip disabled" title="実行方式が「ローカル」のため、この画面からは確認できません。Chromeに追加したWeb Monitor RSS拡張機能のポップアップを開き、そこにある「今すぐ確認」ボタンを押してください。">拡張機能で確認</span>'
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
${systemFeedCard(systemFeedUrl)}
<script>
const csrfToken = '${escapeJs(csrfToken)}';
document.getElementById('monitor-search')?.addEventListener('input', (e) => {
  const query = e.target.value.trim().toLowerCase();
  document.querySelectorAll('#watchlist-table tbody tr').forEach((tr) => {
    const haystack = tr.getAttribute('data-search') || '';
    tr.style.display = haystack.includes(query) ? '' : 'none';
  });
});
let currentSort = { key: null, dir: 1 };
function applySort(key) {
  const tbody = document.querySelector('#watchlist-table tbody');
  if (!tbody) return;
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const dir = currentSort.key === key ? -currentSort.dir : 1;
  currentSort = { key, dir };
  rows.sort((a, b) => {
    const av = a.dataset[key] ?? '';
    const bv = b.dataset[key] ?? '';
    const an = Number(av);
    const bn = Number(bv);
    const bothNumeric = av !== '' && bv !== '' && !Number.isNaN(an) && !Number.isNaN(bn);
    const cmp = bothNumeric ? an - bn : av.localeCompare(bv, 'ja');
    return cmp * dir;
  });
  rows.forEach((row) => tbody.appendChild(row));
  document.querySelectorAll('.sort-trigger').forEach((el) => {
    const active = el.getAttribute('data-sort-key') === key;
    el.classList.toggle('sort-active', active);
    el.classList.toggle('sort-desc', active && dir === -1);
  });
}
document.querySelectorAll('.sort-trigger').forEach((el) => {
  el.addEventListener('click', () => applySort(el.getAttribute('data-sort-key')));
});
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
