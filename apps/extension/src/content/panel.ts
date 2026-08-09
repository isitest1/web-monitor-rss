import type { ExtractionMode, MonitorMode } from '@web-monitor/shared';
import { computePreview, type SelectionDraft } from './selection-draft.js';

export interface PanelState {
  monitorName: string;
  monitorMode: MonitorMode;
  selections: SelectionDraft[];
  statusMessage: string;
  saving: boolean;
}

export interface PanelCallbacks {
  onMonitorNameChange: (value: string) => void;
  onMonitorModeChange: (mode: MonitorMode) => void;
  onLabelChange: (id: string, label: string) => void;
  onExtractionModeChange: (id: string, mode: ExtractionMode) => void;
  onRemove: (id: string) => void;
  onAddFullPage: () => void;
  onSave: () => void;
  onCancel: () => void;
}

const EXTRACTION_MODES: ExtractionMode[] = ['text', 'html', 'attribute', 'link', 'image', 'list'];
const EXTRACTION_MODE_LABELS: Record<ExtractionMode, string> = {
  text: 'テキスト',
  html: 'HTML',
  attribute: '属性値',
  link: 'リンクURL',
  image: '画像URL',
  list: '一覧',
};

export function renderPanel(
  panel: HTMLElement,
  state: PanelState,
  callbacks: PanelCallbacks,
): void {
  panel.innerHTML = '';

  const heading = document.createElement('h2');
  heading.textContent = 'Web Monitor RSS - 選択';
  panel.appendChild(heading);

  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Monitor名';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = state.monitorName;
  nameInput.addEventListener('input', () => callbacks.onMonitorNameChange(nameInput.value));
  nameLabel.appendChild(nameInput);
  panel.appendChild(nameLabel);

  const modeLabel = document.createElement('label');
  modeLabel.textContent = 'Monitorの種類';
  const modeSelect = document.createElement('select');
  for (const [value, text] of [
    ['single', '単一要素'],
    ['list', '一覧（繰り返し）'],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    if (value === state.monitorMode) option.selected = true;
    modeSelect.appendChild(option);
  }
  modeSelect.addEventListener('change', () =>
    callbacks.onMonitorModeChange(modeSelect.value as MonitorMode),
  );
  modeLabel.appendChild(modeSelect);
  panel.appendChild(modeLabel);

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent =
    '要素をクリックまたはEnterで選択に追加します。矢印キーで親・子・兄弟要素へ移動、Deleteで選択を削除、Escapeで終了します。保存すると専用のRSS Feedが自動的に作られます。';
  panel.appendChild(hint);

  const fullPageButton = document.createElement('button');
  fullPageButton.type = 'button';
  fullPageButton.className = 'fullpage-btn';
  fullPageButton.textContent = 'ページ全体を選択に追加';
  fullPageButton.addEventListener('click', () => callbacks.onAddFullPage());
  panel.appendChild(fullPageButton);

  const list = document.createElement('ul');
  for (const selection of state.selections) {
    list.appendChild(renderSelectionItem(selection, callbacks));
  }
  panel.appendChild(list);

  const actions = document.createElement('div');
  actions.className = 'actions';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'cancel-btn';
  cancelButton.textContent = 'キャンセル';
  cancelButton.addEventListener('click', () => callbacks.onCancel());
  actions.appendChild(cancelButton);

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'save-btn';
  saveButton.textContent = state.saving ? '保存中...' : '保存';
  saveButton.disabled = state.saving || state.selections.length === 0;
  saveButton.addEventListener('click', () => callbacks.onSave());
  actions.appendChild(saveButton);

  panel.appendChild(actions);

  if (state.statusMessage) {
    const status = document.createElement('p');
    status.className = 'status';
    status.textContent = state.statusMessage;
    panel.appendChild(status);
  }
}

function renderSelectionItem(selection: SelectionDraft, callbacks: PanelCallbacks): HTMLLIElement {
  const item = document.createElement('li');

  const row = document.createElement('div');
  row.className = 'row';

  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.value = selection.label;
  labelInput.addEventListener('input', () =>
    callbacks.onLabelChange(selection.id, labelInput.value),
  );
  row.appendChild(labelInput);

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'delete-btn';
  deleteButton.textContent = '削除';
  deleteButton.addEventListener('click', () => callbacks.onRemove(selection.id));
  row.appendChild(deleteButton);

  item.appendChild(row);

  const modeSelect = document.createElement('select');
  for (const mode of EXTRACTION_MODES) {
    const option = document.createElement('option');
    option.value = mode;
    option.textContent = EXTRACTION_MODE_LABELS[mode];
    if (mode === selection.extractionMode) option.selected = true;
    modeSelect.appendChild(option);
  }
  modeSelect.addEventListener('change', () =>
    callbacks.onExtractionModeChange(selection.id, modeSelect.value as ExtractionMode),
  );
  item.appendChild(modeSelect);

  const preview = document.createElement('div');
  preview.className = 'preview';
  const matchNote = selection.matchCount > 1 ? `（${selection.matchCount}件に一致） ` : '';
  preview.textContent = `${matchNote}${computePreview(selection)}`;
  item.appendChild(preview);

  return item;
}
