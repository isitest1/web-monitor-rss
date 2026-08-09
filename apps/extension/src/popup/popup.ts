import {
  monitorStatusLabel,
  type MonitorState,
  type MonitorWithSelections,
} from '@web-monitor/shared';
import { sendExtensionMessage } from '../lib/messages.js';

type MonitorListItem = MonitorWithSelections & { state: MonitorState | null };

async function startSelection(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content-script.js'],
  });
  window.close();
}

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function renderWatchlist(container: HTMLElement, monitors: MonitorListItem[]): void {
  if (monitors.length === 0) {
    container.innerHTML = '<p class="empty">監視対象がまだありません。</p>';
    return;
  }
  const list = document.createElement('ul');
  for (const monitor of monitors) {
    const item = document.createElement('li');
    const label = monitorStatusLabel(monitor.state?.status ?? 'UNCHECKED', monitor.enabled);
    item.innerHTML = `<strong>${escapeHtml(monitor.name)}</strong><br /><span class="status">${escapeHtml(label)}</span>`;
    list.appendChild(item);
  }
  container.innerHTML = '';
  container.appendChild(list);
}

async function loadWatchlist(): Promise<void> {
  const container = document.getElementById('watchlist');
  if (!container) return;
  const result = await sendExtensionMessage<{ monitors: MonitorListItem[] }>({
    type: 'LIST_MONITORS',
  });
  if (!result.ok) {
    container.innerHTML = `<p class="empty">${escapeHtml(result.error)}</p>`;
    return;
  }
  renderWatchlist(container, result.data.monitors);
}

document.getElementById('start-selection')?.addEventListener('click', () => {
  void startSelection();
});

void loadWatchlist();
