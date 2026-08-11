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

// The actual tab-open/wait/inject work runs in the background service
// worker (START_EDIT_MONITOR), not here: creating/activating a tab shifts
// window focus away from this popup, and Chrome closes an MV3 action popup
// (killing its JS) the instant it loses focus — so anything awaited here
// after that point would simply never run. Fire-and-forget the message and
// let the popup close naturally as focus moves to the target tab.
function editMonitor(monitor: MonitorListItem): void {
  void sendExtensionMessage({
    type: 'START_EDIT_MONITOR',
    monitorId: monitor.id,
    url: monitor.url,
  });
}

function renderWatchlist(
  container: HTMLElement,
  monitors: MonitorListItem[],
  emptyMessage: string,
): void {
  if (monitors.length === 0) {
    container.innerHTML = `<p class="empty">${escapeHtml(emptyMessage)}</p>`;
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
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'check-now-btn edit-btn';
    editButton.textContent = '編集';
    editButton.addEventListener('click', () => editMonitor(monitor));
    item.appendChild(editButton);
    list.appendChild(item);
  }
  container.innerHTML = '';
  container.appendChild(list);
}

let allMonitors: MonitorListItem[] = [];

function applyModeFilter(): void {
  const container = document.getElementById('watchlist');
  const filterSelect = document.getElementById('mode-filter');
  if (!container) return;
  const mode = filterSelect instanceof HTMLSelectElement ? filterSelect.value : 'all';
  const filtered =
    mode === 'all' ? allMonitors : allMonitors.filter((m) => m.executionMode === mode);
  const emptyMessage =
    allMonitors.length === 0 ? '監視対象がまだありません。' : '該当するMonitorがありません。';
  renderWatchlist(container, filtered, emptyMessage);
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
  allMonitors = result.data.monitors;
  applyModeFilter();
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
document.getElementById('mode-filter')?.addEventListener('change', applyModeFilter);

void loadWatchlist();
void setupAdminLink();
