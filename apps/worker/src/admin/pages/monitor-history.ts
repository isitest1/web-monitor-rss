import {
  diffArrayValues,
  diffScalarText,
  type Change,
  type Check,
  type Monitor,
} from '@web-monitor/shared';
import { layout } from './layout.js';
import { escapeHtml } from './escape.js';

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' });
}

function formatValue(value: string | string[] | undefined): string {
  if (value === undefined) return '(none)';
  return Array.isArray(value) ? value.join(', ') : value;
}

/** Mirrors apps/worker/src/rss/generate.ts's formatScalarDiff so a single-value edit shows just the changed portion in context, not the whole before/after text. */
function formatScalarDiff(oldValue: string, newValue: string): string {
  const diff = diffScalarText(oldValue, newValue);
  if (!diff.changed) return newValue;
  const core =
    diff.removed && diff.added
      ? `${diff.removed} → ${diff.added}`
      : diff.added
        ? `Added: ${diff.added}`
        : `Removed: ${diff.removed}`;
  return `${diff.contextBefore}[${core}]${diff.contextAfter}`;
}

/** Mirrors apps/worker/src/rss/generate.ts's formatChangeLine so the admin history and RSS descriptions agree on how a change reads. */
function formatChangeLine(
  label: string,
  oldValue: string | string[] | undefined,
  newValue: string | string[] | undefined,
): string {
  if (Array.isArray(newValue)) {
    const { added, removed } = diffArrayValues(
      Array.isArray(oldValue) ? oldValue : undefined,
      newValue,
    );
    const parts: string[] = [];
    if (added.length > 0) parts.push(`Added: ${added.join(', ')}`);
    if (removed.length > 0) parts.push(`Removed: ${removed.join(', ')}`);
    const diffText = parts.length > 0 ? parts.join(' / ') : '(order changed)';
    return `${label}: ${diffText}`;
  }
  const diffText =
    typeof oldValue === 'string' && typeof newValue === 'string'
      ? formatScalarDiff(oldValue, newValue)
      : `${formatValue(oldValue)} → ${formatValue(newValue)}`;
  return `${label}: ${diffText}`;
}

export function monitorHistoryPage(monitor: Monitor, checks: Check[], changes: Change[]): string {
  const body = `
<p><a href="/monitors">&larr; Back to Watchlist</a></p>
<div class="card">
  <h1>${escapeHtml(monitor.name)} History</h1>
  <p class="muted"><a href="${escapeHtml(monitor.url)}" target="_blank" rel="noopener">${escapeHtml(monitor.url)}</a></p>

  <h2>Change History</h2>
  <table>
    <thead><tr><th>Detected At</th><th>Type</th><th>Details</th></tr></thead>
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
                return escapeHtml(
                  formatChangeLine(label, oldVal?.displayValue, newVal?.displayValue),
                );
              })
              .join('<br/>')}</td>
          </tr>`,
        )
        .join('')}
    </tbody>
  </table>
  ${changes.length === 0 ? '<p class="muted">No change history yet.</p>' : ''}

  <h2>Check History (last 100)</h2>
  <table>
    <thead><tr><th>Started</th><th>Status</th><th>Duration</th><th>HTTP</th><th>Error</th></tr></thead>
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
  ${checks.length === 0 ? '<p class="muted">No check history yet.</p>' : ''}
</div>
`;
  return layout(`${monitor.name} - History`, body);
}
