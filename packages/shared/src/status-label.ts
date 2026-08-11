import type { MonitorStatus } from './status-codes.js';

/**
 * Display labels for a Monitor's current state, shared between the admin UI
 * and the extension's Watchlist so both surfaces describe the same states
 * identically (§12: No change/Not checked yet/Check failed/Selector not found/Monitor disabled).
 */
export function monitorStatusLabel(status: MonitorStatus, enabled: boolean): string {
  if (!enabled) return 'Monitor disabled';
  switch (status) {
    case 'UNCHECKED':
      return 'Not checked yet';
    case 'BASELINED':
    case 'OK':
      return 'No change';
    case 'CHANGED':
      return 'Changed';
    case 'SELECTOR_NOT_FOUND':
    case 'SELECTOR_NOT_UNIQUE':
      return 'Selector not found';
    default:
      return 'Check failed';
  }
}
