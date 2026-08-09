import type { MonitorStatus } from './status-codes.js';

/**
 * Japanese display labels for a Monitor's current state, shared between the
 * admin UI and the extension's Watchlist so both surfaces describe the
 * same states identically (§12: 変更なし/未確認/確認失敗/Selectorが見つからない/Monitor無効).
 */
export function monitorStatusLabel(status: MonitorStatus, enabled: boolean): string {
  if (!enabled) return 'Monitor無効';
  switch (status) {
    case 'UNCHECKED':
      return '未確認';
    case 'BASELINED':
    case 'OK':
      return '変更なし';
    case 'CHANGED':
      return '変更あり';
    case 'SELECTOR_NOT_FOUND':
    case 'SELECTOR_NOT_UNIQUE':
      return 'Selectorが見つからない';
    default:
      return '確認失敗';
  }
}
