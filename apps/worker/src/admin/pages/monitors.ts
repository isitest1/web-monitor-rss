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

// Used only for the "status" sort-trigger, so clicking it surfaces the
// monitors that most need attention (failing) first.
function statusSortPriority(cls: string, enabled: boolean): number {
  if (cls === 'status-error') return 1;
  if (cls === 'status-ok') return 2;
  if (enabled) return 3; // UNCHECKED
  return 4; // disabled
}

function summarizeValue(state: MonitorState | null): string {
  if (!state?.currentValue || state.currentValue.length === 0) return '(not checked yet)';
  const parts = state.currentValue.slice(0, 2).map((v) => {
    // Flattened to one line on purpose: this is a truncated, dense
    // Watchlist-table summary, not the full multi-line value (see the
    // Monitor's own history page for that).
    const display = Array.isArray(v.displayValue)
      ? v.displayValue.join(', ')
      : v.displayValue.replace(/\n+/g, ' ');
    return `${v.label}: ${display}`;
  });
  const summary = parts.join(' / ');
  return summary.length > 80 ? `${summary.slice(0, 80)}...` : summary;
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' });
}

function healthBanner(state: SystemState): string {
  if (state.alertStatus === 'healthy') return '';
  return `<div class="card alert-card">
    <strong class="status-error">Possible outage</strong>
    <p class="muted">Runner last succeeded: ${escapeHtml(formatDate(state.lastRunnerSuccessAt))}</p>
  </div>`;
}

function systemFeedCard(systemFeedUrl: string | null): string {
  if (!systemFeedUrl) return '';
  return `<div class="card">
    <div class="top-bar">
      <div>
        <h2 style="margin-bottom:0;">System Status RSS</h2>
        <p class="muted" style="margin-top:0.2rem;">Dedicated feed for uptime alerts and recovery notifications. We recommend subscribing to it in your RSS reader.</p>
      </div>
    </div>
    <div class="actions-row">
      <input type="text" readonly value="${escapeHtml(systemFeedUrl)}" class="rss-url" style="flex:1; min-width: 260px;" onclick="this.select()" />
      <a href="${escapeHtml(systemFeedUrl)}" target="_blank" rel="noopener">Open</a>
      <button class="secondary copy-btn" data-url="${escapeHtml(systemFeedUrl)}">Copy</button>
    </div>
  </div>`;
}

const CHECK_INTERVAL_PRESETS: Array<{ seconds: number; label: string }> = [
  { seconds: 3600, label: 'Every hour' },
  { seconds: 10800, label: 'Every 3 hours' },
  { seconds: 21600, label: 'Every 6 hours' },
  { seconds: 43200, label: 'Every 12 hours' },
  { seconds: 86400, label: 'Every 24 hours' },
];

function executionModeSelect(monitor: Monitor): string {
  const options = [
    { value: 'server', label: 'Server' },
    { value: 'local', label: 'Local' },
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
      <a href="${escapeHtml(feed.rssUrl)}" target="_blank" rel="noopener" title="${escapeHtml(feed.rssUrl)}">View RSS</a>
      <button class="link copy-btn" data-url="${escapeHtml(feed.rssUrl)}">Copy</button>
    </div>`;
  }
  if (feed.rssTokenStatus === 'active') {
    return '<span class="muted">URL not recorded (shown after reissue)</span>';
  }
  return '<span class="muted">Revoked</span>';
}

export function monitorsPage(
  rows: MonitorRow[],
  systemFeedUrl: string | null,
  systemState: SystemState,
  csrfToken: string,
): string {
  const groupNames = [
    ...new Set(rows.map((r) => r.monitor.groupName).filter((g): g is string => !!g)),
  ].sort((a, b) => a.localeCompare(b));
  const groupFilterOptions = [
    '<option value="all">All</option>',
    '<option value="__none__">Ungrouped</option>',
    ...groupNames.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`),
  ].join('');
  const groupDatalistOptions = groupNames
    .map((g) => `<option value="${escapeHtml(g)}"></option>`)
    .join('');

  const body = `
${healthBanner(systemState)}
<div class="card">
  <div class="top-bar">
    <h1 style="margin-bottom:0;">Watchlist</h1>
    <div class="actions-row">
      <input type="text" id="monitor-search" placeholder="Search by Monitor name or URL" style="width:220px;" />
      <select id="group-filter" title="Filter by group">${groupFilterOptions}</select>
      <button class="secondary" id="logout-btn">Log Out</button>
    </div>
  </div>
  <div class="bulk-actions-bar" id="bulk-actions-bar" style="display:none;">
    <span id="bulk-selected-count" class="muted"></span>
    <button class="secondary" id="bulk-enable-btn">Enable</button>
    <button class="secondary" id="bulk-disable-btn">Disable</button>
    <span class="bulk-group">
      <select id="bulk-execution-mode"><option value="server">Server</option><option value="local">Local</option></select>
      <button class="secondary" id="bulk-execution-mode-btn">Apply execution mode</button>
    </span>
    <span class="bulk-group">
      <select id="bulk-interval">${CHECK_INTERVAL_PRESETS.map((p) => `<option value="${p.seconds}">${p.label}</option>`).join('')}</select>
      <button class="secondary" id="bulk-interval-btn">Apply interval</button>
    </span>
    <button class="danger-link" id="bulk-delete-btn">Delete selected Monitors</button>
  </div>
  <datalist id="group-options">${groupDatalistOptions}</datalist>
  <table class="table-align-top" id="watchlist-table">
    <thead>
      <tr>
        <th><input type="checkbox" id="select-all" title="Select all" /></th>
        <th class="sort-trigger" data-sort-key="name">Monitor</th><th>Current value</th><th>RSS</th><th class="sort-trigger" data-sort-key="executionMode">Check settings</th><th>History</th><th>Actions</th>
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
          const groupName = row.monitor.groupName ?? '';
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
            data-group="${escapeHtml(groupName)}"
          >
            <td><input type="checkbox" class="row-select" data-id="${escapeHtml(row.monitor.id)}" /></td>
            <td>
              <div class="cell-stack">
                <strong>${escapeHtml(row.monitor.name)}</strong>
                <span class="${cls} sort-trigger" data-sort-key="statusPriority" title="Click to sort by status">${escapeHtml(label)}</span>
                <input type="text" class="group-input" list="group-options" placeholder="Group (optional)" value="${escapeHtml(groupName)}" data-id="${escapeHtml(row.monitor.id)}" />
              </div>
            </td>
            <td>${escapeHtml(summarizeValue(row.state))}</td>
            <td>
              <div class="cell-stack">
                ${feedCell(row.feed)}
                <span class="muted">${row.feed.itemCount} item${row.feed.itemCount === 1 ? '' : 's'}</span>
              </div>
            </td>
            <td>
              <div class="cell-stack">
                ${executionModeSelect(row.monitor)}
                ${checkIntervalSelect(row.monitor)}
              </div>
            </td>
            <td>
              <div class="cell-stack nowrap">
                <div><span class="field-label sort-trigger" data-sort-key="lastChecked">Checked</span>${escapeHtml(formatDate(row.state?.lastCheckedAt ?? null))}</div>
                <div><span class="field-label sort-trigger" data-sort-key="lastSuccess">Success</span>${escapeHtml(formatDate(row.state?.lastSuccessAt ?? null))}</div>
                <div><span class="field-label sort-trigger" data-sort-key="lastChanged">Changed</span>${escapeHtml(formatDate(row.state?.lastChangedAt ?? null))}</div>
                <div><span class="field-label sort-trigger" data-sort-key="failures">Failures</span><span class="${failures > 0 ? 'status-error' : ''}">${failures}</span></div>
              </div>
            </td>
            <td>
              <div class="actions-grid">
                <a class="action-chip" href="${escapeHtml(row.monitor.url)}" target="_blank" rel="noopener">Original page</a>
                <a class="action-chip" href="/monitors/${escapeHtml(row.monitor.id)}/history">History</a>
                ${
                  row.monitor.executionMode === 'local'
                    ? "<span class=\"action-chip disabled\" title=\"Execution mode is 'Local', so this can't be checked from here. Open the Web Monitor RSS extension popup in Chrome and press 'Check now' there.\">Check via extension</span>"
                    : `<button class="action-chip check-btn" data-id="${escapeHtml(row.monitor.id)}">Check now</button>`
                }
                <button class="action-chip toggle-btn" data-id="${escapeHtml(row.monitor.id)}" data-enabled="${row.monitor.enabled}">${row.monitor.enabled ? 'Disable' : 'Enable'}</button>
                <button class="action-chip rotate-btn" data-feed-id="${escapeHtml(row.feed.id)}">Reissue token</button>
                <button class="action-chip danger delete-btn" data-id="${escapeHtml(row.monitor.id)}" data-name="${escapeHtml(row.monitor.name)}">Delete</button>
              </div>
            </td>
          </tr>`;
        })
        .join('')}
    </tbody>
  </table>
  ${rows.length === 0 ? '<p class="muted">No Monitors yet. Use the Chrome extension to select and register one.</p>' : ''}
</div>
<p class="muted">RSS URLs contain an access token. Do not share them with anyone else.</p>
${systemFeedCard(systemFeedUrl)}
<script>
const csrfToken = '${escapeJs(csrfToken)}';
function applyRowFilters() {
  const query = (document.getElementById('monitor-search')?.value || '').trim().toLowerCase();
  const group = document.getElementById('group-filter')?.value || 'all';
  document.querySelectorAll('#watchlist-table tbody tr').forEach((tr) => {
    const haystack = tr.getAttribute('data-search') || '';
    const rowGroup = tr.getAttribute('data-group') || '';
    const matchesSearch = haystack.includes(query);
    const matchesGroup =
      group === 'all' || (group === '__none__' ? rowGroup === '' : rowGroup === group);
    tr.style.display = matchesSearch && matchesGroup ? '' : 'none';
  });
}
document.getElementById('monitor-search')?.addEventListener('input', applyRowFilters);
document.getElementById('group-filter')?.addEventListener('change', applyRowFilters);
document.querySelectorAll('.group-input').forEach((input) => {
  input.addEventListener('change', async () => {
    const id = input.getAttribute('data-id');
    const value = input.value.trim();
    await fetch('/api/monitors/' + id, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ groupName: value === '' ? null : value }),
    });
    window.location.reload();
  });
});
function getSelectedIds() {
  return Array.from(document.querySelectorAll('.row-select:checked')).map((cb) =>
    cb.getAttribute('data-id'),
  );
}
function updateBulkBar() {
  const ids = getSelectedIds();
  const bar = document.getElementById('bulk-actions-bar');
  const countEl = document.getElementById('bulk-selected-count');
  if (!bar || !countEl) return;
  bar.style.display = ids.length > 0 ? 'flex' : 'none';
  countEl.textContent = ids.length + ' selected';
}
document.getElementById('select-all')?.addEventListener('change', (e) => {
  document.querySelectorAll('.row-select').forEach((cb) => {
    cb.checked = e.target.checked;
  });
  updateBulkBar();
});
document.querySelectorAll('.row-select').forEach((cb) => {
  cb.addEventListener('change', updateBulkBar);
});
document.getElementById('bulk-enable-btn')?.addEventListener('click', async () => {
  const ids = getSelectedIds();
  await Promise.all(
    ids.map((id) =>
      fetch('/api/monitors/' + id + '/enable', {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
      }),
    ),
  );
  window.location.reload();
});
document.getElementById('bulk-disable-btn')?.addEventListener('click', async () => {
  const ids = getSelectedIds();
  await Promise.all(
    ids.map((id) =>
      fetch('/api/monitors/' + id + '/disable', {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
      }),
    ),
  );
  window.location.reload();
});
document.getElementById('bulk-execution-mode-btn')?.addEventListener('click', async () => {
  const ids = getSelectedIds();
  const value = document.getElementById('bulk-execution-mode').value;
  await Promise.all(
    ids.map((id) =>
      fetch('/api/monitors/' + id, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ executionMode: value }),
      }),
    ),
  );
  window.location.reload();
});
document.getElementById('bulk-interval-btn')?.addEventListener('click', async () => {
  const ids = getSelectedIds();
  const value = Number(document.getElementById('bulk-interval').value);
  await Promise.all(
    ids.map((id) =>
      fetch('/api/monitors/' + id, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ checkIntervalSec: value }),
      }),
    ),
  );
  window.location.reload();
});
document.getElementById('bulk-delete-btn')?.addEventListener('click', async () => {
  const ids = getSelectedIds();
  if (!confirm('Delete ' + ids.length + ' Monitor(s)? This also deletes their history.'))
    return;
  await Promise.all(
    ids.map((id) => fetch('/api/monitors/' + id, { method: 'DELETE', headers: { 'x-csrf-token': csrfToken } })),
  );
  window.location.reload();
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
    const cmp = bothNumeric ? an - bn : av.localeCompare(bv);
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
      alert('Check requested. Refresh this page in a few minutes to see the result.');
    } else if (res.status === 503) {
      alert('This feature is not configured (GITHUB_DISPATCH_TOKEN must be set on the Worker). Trigger it manually from the GitHub Actions tab instead.');
    } else {
      alert('Failed to request a check. Please try again later.');
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
    if (!confirm('Delete "' + name + '"? This also deletes its history.')) return;
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
    if (!confirm('The current RSS URL will be invalidated and replaced with a new one. Continue?')) return;
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
