import {
  diffArrayValues,
  formatChangeLineHtml,
  type Change,
  type Check,
  type Monitor,
} from '@web-monitor/shared';
import { layout } from './layout.js';
import { escapeHtml, escapeHtmlMultiline } from './escape.js';

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' });
}

/** Mirrors apps/worker/src/rss/generate.ts's imageTags: <img> tags for a Selection's captured images, linked back to the source page, display-only. */
function imageTags(images: string[] | undefined, link: string): string {
  if (!images || images.length === 0) return '';
  return images
    .map(
      (url) =>
        `<br/><a href="${escapeHtml(link)}" target="_blank" rel="noopener"><img src="${escapeHtml(url)}" alt="" style="max-width:200px;height:auto;" /></a>`,
    )
    .join('');
}

/** Mirrors apps/worker/src/rss/generate.ts's addedListItemImages: pairs a list-mode Selection's newly added display strings back to their per-item captured images. */
function addedListItemImages(
  oldDisplay: string[] | undefined,
  newDisplay: string[],
  itemImages: string[][] | undefined,
): string[] {
  if (!itemImages) return [];
  const { added } = diffArrayValues(oldDisplay, newDisplay);
  const usedIndices = new Set<number>();
  const images: string[] = [];
  for (const item of added) {
    const idx = newDisplay.findIndex((v, i) => v === item && !usedIndices.has(i));
    if (idx === -1) continue;
    usedIndices.add(idx);
    for (const url of itemImages[idx] ?? []) {
      if (!images.includes(url)) images.push(url);
    }
  }
  return images;
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
                const images = Array.isArray(newVal?.displayValue)
                  ? addedListItemImages(
                      Array.isArray(oldVal?.displayValue) ? oldVal.displayValue : undefined,
                      newVal.displayValue,
                      newVal.itemImages,
                    )
                  : newVal?.images;
                return (
                  formatChangeLineHtml(
                    label,
                    oldVal?.displayValue,
                    newVal?.displayValue,
                    true,
                    monitor.changeDisplayMode,
                    escapeHtmlMultiline,
                  ) + imageTags(images, monitor.url)
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
