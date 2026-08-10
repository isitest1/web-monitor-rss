import type {
  CreateMonitorRequest,
  MonitorWithSelections,
  UpdateMonitorRequest,
} from '@web-monitor/shared';

export type ExtensionMessage =
  | { type: 'LIST_MONITORS' }
  | { type: 'GET_MONITOR'; monitorId: string }
  | { type: 'CREATE_MONITOR'; payload: CreateMonitorRequest }
  | { type: 'UPDATE_MONITOR'; monitorId: string; payload: UpdateMonitorRequest }
  | { type: 'SET_MONITOR_ENABLED'; monitorId: string; enabled: boolean }
  | { type: 'PING_API' }
  | { type: 'START_SELECTION_MODE'; monitorMode: 'single' | 'list' }
  | { type: 'RUN_LOCAL_CHECK_NOW'; monitorId: string };

export type MessageResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ListMonitorsResult {
  monitors: MonitorWithSelections[];
}

export async function sendExtensionMessage<T>(
  message: ExtensionMessage,
): Promise<MessageResult<T>> {
  try {
    return (await chrome.runtime.sendMessage(message)) as MessageResult<T>;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
