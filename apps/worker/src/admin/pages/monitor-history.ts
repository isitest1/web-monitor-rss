import type { Change, Check, Monitor } from '@web-monitor/shared';
import { layout } from './layout.js';
import { escapeHtml } from './escape.js';

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

function formatValue(value: string | string[] | undefined): string {
  if (value === undefined) return '(なし)';
  return Array.isArray(value) ? value.join(', ') : value;
}

export function monitorHistoryPage(monitor: Monitor, checks: Check[], changes: Change[]): string {
  const body = `
<p><a href="/monitors">&larr; Watchlistへ戻る</a></p>
<div class="card">
  <h1>${escapeHtml(monitor.name)} の履歴</h1>
  <p class="muted"><a href="${escapeHtml(monitor.url)}" target="_blank" rel="noopener">${escapeHtml(monitor.url)}</a></p>

  <h2>変更履歴</h2>
  <table>
    <thead><tr><th>検出日時</th><th>種別</th><th>詳細</th></tr></thead>
    <tbody>
      ${changes
        .map(
          (change) => `<tr>
            <td>${escapeHtml(formatDate(change.detectedAt))}</td>
            <td>${escapeHtml(change.changeType)}</td>
            <td>${(change.changedSelectionIds.length > 0 ? change.changedSelectionIds : ['*'])
              .map((id) => {
                const oldVal = change.oldValue?.find((v) => v.selectionId === id);
                const newVal = change.newValue?.find((v) => v.selectionId === id);
                const label = newVal?.label ?? oldVal?.label ?? '';
                return `${escapeHtml(label)}: ${escapeHtml(formatValue(oldVal?.displayValue))} → ${escapeHtml(formatValue(newVal?.displayValue))}`;
              })
              .join('<br/>')}</td>
          </tr>`,
        )
        .join('')}
    </tbody>
  </table>
  ${changes.length === 0 ? '<p class="muted">変更履歴はまだありません。</p>' : ''}

  <h2>確認履歴（直近100件）</h2>
  <table>
    <thead><tr><th>開始</th><th>状態</th><th>所要時間</th><th>HTTP</th><th>エラー</th></tr></thead>
    <tbody>
      ${checks
        .map(
          (check) => `<tr>
            <td>${escapeHtml(formatDate(check.startedAt))}</td>
            <td class="${check.status === 'SUCCESS' ? 'status-ok' : 'status-error'}">${escapeHtml(check.status)}</td>
            <td>${check.durationMs}ms</td>
            <td>${check.httpStatus ?? '-'}</td>
            <td>${escapeHtml(check.errorMessage ?? '-')}</td>
          </tr>`,
        )
        .join('')}
    </tbody>
  </table>
  ${checks.length === 0 ? '<p class="muted">確認履歴はまだありません。</p>' : ''}
</div>
`;
  return layout(`${monitor.name} - 履歴`, body);
}
