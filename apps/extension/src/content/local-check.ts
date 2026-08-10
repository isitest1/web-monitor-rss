import {
  extractAllSelectionsFromDom,
  SelectionExtractionError,
} from '@web-monitor/selector-engine';
import { classifyException } from '@web-monitor/shared';
import type {
  RunLocalExtractionMessage,
  RunLocalExtractionResult,
} from '../lib/local-check-protocol.js';

// Injected once per local check via chrome.scripting.executeScript, after
// the background service worker observes the tab finish loading. Listens
// for exactly one RUN_LOCAL_EXTRACTION message and replies with the
// extracted values or a classified failure — never anything else (no page
// HTML, no cookies), per §13.
function isRunLocalExtractionMessage(message: unknown): message is RunLocalExtractionMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'RUN_LOCAL_EXTRACTION'
  );
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isRunLocalExtractionMessage(message)) return undefined;

  extractAllSelectionsFromDom(message.selections)
    .then((values) => {
      const result: RunLocalExtractionResult = { ok: true, values };
      sendResponse(result);
    })
    .catch((error: unknown) => {
      const classified =
        error instanceof SelectionExtractionError
          ? { statusCode: error.statusCode, message: error.message }
          : classifyException(error);
      const result: RunLocalExtractionResult = {
        ok: false,
        statusCode: classified.statusCode,
        message: classified.message,
      };
      sendResponse(result);
    });

  return true;
});
