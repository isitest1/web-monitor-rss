import type { Selection } from '@web-monitor/shared';
import type { SelectionDraft } from './selection-draft.js';

function resolveElement(selection: Selection): Element | null {
  if (selection.selectorType === 'document') return document.documentElement;
  try {
    return document.querySelector(selection.selector);
  } catch {
    return null;
  }
}

function countMatches(selection: Selection): number {
  if (selection.selectorType === 'document') return 1;
  try {
    return document.querySelectorAll(selection.selector).length;
  } catch {
    return 0;
  }
}

/**
 * Rebuilds a SelectionDraft from an already-saved Selection when entering
 * edit mode, by re-resolving its selector against the current page's DOM.
 * If the selector no longer matches (site changed since it was saved), the
 * draft comes back with `element: null, resolved: false` instead of being
 * silently pointed at a different element — the user must explicitly
 * re-click a replacement (no auto-repair, per CLAUDE.md §2).
 */
export function resolveDraftFromSelection(selection: Selection): SelectionDraft {
  const element = resolveElement(selection);
  return {
    id: selection.id,
    savedId: selection.id,
    label: selection.label,
    element,
    resolved: element !== null,
    selectorType: selection.selectorType,
    selector: selection.selector,
    selectorCandidates: selection.selectorCandidates,
    matchCount: element ? countMatches(selection) : 0,
    extractionMode: selection.extractionMode,
    attributeName: selection.attributeName,
    matchMode: selection.matchMode,
    normalization: selection.normalization,
  };
}
