import { SelectionController } from './selection-controller.js';

declare global {
  interface Window {
    __webMonitorSelectionController?: SelectionController;
  }
}

// Injected on demand via chrome.scripting.executeScript; injecting again
// while already active (e.g. clicking "start selection" twice) must be a
// no-op rather than creating a second overlay.
if (!window.__webMonitorSelectionController) {
  const controller = new SelectionController();
  window.__webMonitorSelectionController = controller;
  void controller.start();
}
