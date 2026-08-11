import type { ExtractionMode, MonitorMode } from '@web-monitor/shared';
import { computePreview, type SelectionDraft } from './selection-draft.js';

export interface PanelState {
  monitorName: string;
  monitorMode: MonitorMode;
  groupName: string | null;
  selections: SelectionDraft[];
  statusMessage: string;
  saving: boolean;
  /** Non-null when editing an already-saved Monitor instead of creating a new one. */
  editingMonitorId: string | null;
  /** Draft id currently awaiting a replacement click, if any. */
  reselectTargetId: string | null;
}

export interface PanelCallbacks {
  onMonitorNameChange: (value: string) => void;
  onGroupNameChange: (value: string) => void;
  onMonitorModeChange: (mode: MonitorMode) => void;
  onLabelChange: (id: string, label: string) => void;
  onExtractionModeChange: (id: string, mode: ExtractionMode) => void;
  onRemove: (id: string) => void;
  onReselect: (id: string) => void;
  onAddFullPage: () => void;
  onSave: () => void;
  onCancel: () => void;
}

const EXTRACTION_MODES: ExtractionMode[] = ['text', 'html', 'attribute', 'link', 'image', 'list'];
const EXTRACTION_MODE_LABELS: Record<ExtractionMode, string> = {
  text: 'Text',
  html: 'HTML',
  attribute: 'Attribute',
  link: 'Link URL',
  image: 'Image URL',
  list: 'List',
};

export function renderPanel(
  panel: HTMLElement,
  state: PanelState,
  callbacks: PanelCallbacks,
): void {
  panel.innerHTML = '';

  const heading = document.createElement('h2');
  heading.textContent = state.editingMonitorId
    ? 'Web Monitor RSS - Editing Monitor'
    : 'Web Monitor RSS - Selection';
  panel.appendChild(heading);

  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Monitor name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = state.monitorName;
  nameInput.addEventListener('input', () => callbacks.onMonitorNameChange(nameInput.value));
  nameLabel.appendChild(nameInput);
  panel.appendChild(nameLabel);

  const groupLabel = document.createElement('label');
  groupLabel.textContent = 'Group (optional)';
  const groupInput = document.createElement('input');
  groupInput.type = 'text';
  groupInput.placeholder = 'e.g. Pharma, Fishing reports';
  groupInput.value = state.groupName ?? '';
  groupInput.addEventListener('input', () => callbacks.onGroupNameChange(groupInput.value));
  groupLabel.appendChild(groupInput);
  panel.appendChild(groupLabel);

  const modeLabel = document.createElement('label');
  modeLabel.textContent = 'Monitor type';
  const modeSelect = document.createElement('select');
  for (const [value, text] of [
    ['single', 'Single element'],
    ['list', 'List (repeating)'],
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
  hint.textContent = state.reselectTargetId
    ? 'Click the element on the page to use as a replacement.'
    : 'Click an element or press Enter to add it to the selection. Use the arrow keys to move to a parent/child/sibling element, Delete to remove a selection, Escape to finish. A dedicated RSS Feed is created automatically when you save.';
  panel.appendChild(hint);

  const fullPageButton = document.createElement('button');
  fullPageButton.type = 'button';
  fullPageButton.className = 'fullpage-btn';
  fullPageButton.textContent = 'Add whole page to selection';
  fullPageButton.addEventListener('click', () => callbacks.onAddFullPage());
  panel.appendChild(fullPageButton);

  const list = document.createElement('ul');
  for (const selection of state.selections) {
    list.appendChild(renderSelectionItem(selection, state, callbacks));
  }
  panel.appendChild(list);

  const actions = document.createElement('div');
  actions.className = 'actions';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'cancel-btn';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', () => callbacks.onCancel());
  actions.appendChild(cancelButton);

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'save-btn';
  saveButton.textContent = state.saving ? 'Saving...' : 'Save';
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

function renderSelectionItem(
  selection: SelectionDraft,
  state: PanelState,
  callbacks: PanelCallbacks,
): HTMLLIElement {
  const item = document.createElement('li');
  if (!selection.resolved) item.className = 'unresolved';

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
  deleteButton.textContent = 'Delete';
  deleteButton.addEventListener('click', () => callbacks.onRemove(selection.id));
  row.appendChild(deleteButton);

  item.appendChild(row);

  if (!selection.resolved) {
    const warning = document.createElement('div');
    warning.className = 'unresolved-warning';
    const isTargeted = state.reselectTargetId === selection.id;
    const warningText = document.createElement('span');
    warningText.textContent = isTargeted
      ? 'Click the element on the page to use as a replacement.'
      : 'Element not found (the site may have changed).';
    warning.appendChild(warningText);
    if (!isTargeted) {
      const reselectButton = document.createElement('button');
      reselectButton.type = 'button';
      reselectButton.className = 'reselect-btn';
      reselectButton.textContent = 'Re-select';
      reselectButton.addEventListener('click', () => callbacks.onReselect(selection.id));
      warning.appendChild(reselectButton);
    }
    item.appendChild(warning);
  } else {
    const reselectButton = document.createElement('button');
    reselectButton.type = 'button';
    reselectButton.className = 'reselect-btn';
    reselectButton.textContent = 'Pick a different element';
    reselectButton.addEventListener('click', () => callbacks.onReselect(selection.id));
    item.appendChild(reselectButton);
  }

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
  const matchNote = selection.matchCount > 1 ? `(matches ${selection.matchCount} elements) ` : '';
  preview.textContent = `${matchNote}${computePreview(selection)}`;
  item.appendChild(preview);

  return item;
}
