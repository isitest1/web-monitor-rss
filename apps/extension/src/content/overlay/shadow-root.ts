export const OVERLAY_HOST_ID = 'web-monitor-overlay-root';

const STYLES = `
  :host { all: initial; }
  .host-inner {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    pointer-events: none;
    font-family: system-ui, sans-serif;
  }
  .hover-box, .selected-box {
    position: fixed;
    box-sizing: border-box;
    pointer-events: none;
  }
  .hover-box {
    border: 2px dashed #2563eb;
    background: rgba(37, 99, 235, 0.08);
  }
  .selected-box {
    border: 2px solid #16a34a;
    background: rgba(22, 163, 74, 0.08);
  }
  .panel {
    position: fixed;
    top: 12px;
    right: 12px;
    width: 300px;
    max-height: calc(100vh - 24px);
    overflow-y: auto;
    background: #fff;
    color: #1a1a1a;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
    padding: 12px;
    pointer-events: auto;
    font-size: 12px;
  }
  .panel h2 { font-size: 13px; margin: 0 0 8px; }
  .panel label { display: block; margin-top: 8px; font-size: 11px; color: #444; }
  .panel input, .panel select { width: 100%; box-sizing: border-box; padding: 4px; margin-top: 2px; }
  .panel .hint { color: #666; font-size: 11px; margin-top: 4px; }
  .panel ul { list-style: none; margin: 8px 0 0; padding: 0; }
  .panel li { border: 1px solid #e5e5e5; border-radius: 6px; padding: 6px; margin-top: 6px; }
  .panel li .row { display: flex; justify-content: space-between; align-items: center; gap: 4px; }
  .panel li .preview { color: #555; font-size: 11px; margin-top: 4px; word-break: break-all; }
  .panel button { cursor: pointer; }
  .panel .delete-btn { background: #fee2e2; color: #b91c1c; border: none; border-radius: 4px; padding: 2px 6px; }
  .panel .actions { display: flex; gap: 8px; margin-top: 12px; }
  .panel .actions button { flex: 1; padding: 6px; border: none; border-radius: 6px; }
  .panel .save-btn { background: #16a34a; color: #fff; }
  .panel .fullpage-btn { background: #eef2ff; color: #3730a3; width: 100%; margin-top: 8px; padding: 6px; border: none; border-radius: 6px; }
  .panel .cancel-btn { background: #e5e5e5; color: #1a1a1a; }
  .panel .status { margin-top: 8px; font-size: 11px; }
  .panel li.unresolved { border-color: #fca5a5; background: #fff5f5; }
  .panel .unresolved-warning { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 4px; font-size: 11px; color: #b91c1c; }
  .panel .reselect-btn { background: #eef2ff; color: #3730a3; border: none; border-radius: 4px; padding: 2px 6px; margin-top: 4px; font-size: 11px; }
`;

export interface OverlayRoot {
  host: HTMLElement;
  shadow: ShadowRoot;
  hoverBox: HTMLDivElement;
  selectedBoxesContainer: HTMLDivElement;
  panel: HTMLDivElement;
}

export function createOverlayRoot(): OverlayRoot {
  const host = document.createElement('div');
  host.id = OVERLAY_HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.appendChild(style);

  const inner = document.createElement('div');
  inner.className = 'host-inner';
  shadow.appendChild(inner);

  const hoverBox = document.createElement('div');
  hoverBox.className = 'hover-box';
  hoverBox.style.display = 'none';
  inner.appendChild(hoverBox);

  const selectedBoxesContainer = document.createElement('div');
  inner.appendChild(selectedBoxesContainer);

  const panel = document.createElement('div');
  panel.className = 'panel';
  inner.appendChild(panel);

  document.documentElement.appendChild(host);

  return { host, shadow, hoverBox, selectedBoxesContainer, panel };
}

export function positionBox(box: HTMLElement, rect: DOMRect): void {
  box.style.display = 'block';
  box.style.left = `${rect.left}px`;
  box.style.top = `${rect.top}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
}
