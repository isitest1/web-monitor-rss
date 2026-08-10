import type { ExtractedSelectionValue, Selection, StatusCode } from '@web-monitor/shared';

/** Message the background service worker sends to local-check-content.js after a monitored page finishes loading in a background tab. */
export interface RunLocalExtractionMessage {
  type: 'RUN_LOCAL_EXTRACTION';
  selections: Selection[];
}

export type RunLocalExtractionResult =
  | { ok: true; values: ExtractedSelectionValue[] }
  | { ok: false; statusCode: StatusCode; message: string };
