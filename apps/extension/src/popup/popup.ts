import {
  monitorStatusLabel,
  type MonitorState,
  type MonitorWithSelections,
} from '@web-monitor/shared';
import { sendExtensionMessage } from '../lib/messages.js';
import { getConfig } from '../lib/storage.js';

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

async function runLocalCheckNow(monitorId: string, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  button.textContent = '確認中...';
  const result = await sendExtensionMessage<null>({ type: 'RUN_LOCAL_CHECK_NOW', monitorId });
  button.disabled = false;
  button.textContent = result.ok ? '確認しました' : '今すぐ確認 (失敗)';
  setTimeout(() => void loadWatchlist(), 1500);
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
    const badge = monitor.executionMode === 'local' ? '<span class="badge">ローカル</span>' : '';
    item.innerHTML = `<strong>${escapeHtml(monitor.name)}</strong>${badge}<br /><span class="status">${escapeHtml(label)}</span>`;
    if (monitor.executionMode === 'local') {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'check-now-btn';
      button.textContent = '今すぐ確認';
      button.addEventListener('click', () => void runLocalCheckNow(monitor.id, button));
      item.appendChild(button);
    }
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

async function setupAdminLink(): Promise<void> {
  const link = document.getElementById('open-admin');
  if (!(link instanceof HTMLAnchorElement)) return;
  const config = await getConfig();
  link.href = `${config.apiBaseUrl}/monitors`;
}

document.getElementById('start-selection')?.addEventListener('click', () => {
  void startSelection();
});

void loadWatchlist();
void setupAdminLink();
