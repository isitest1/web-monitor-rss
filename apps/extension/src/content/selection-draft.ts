import {
  DEFAULT_NORMALIZATION_CONFIG,
  normalizeDefault,
  type ExtractionMode,
  type MatchMode,
  type MonitorMode,
  type NormalizationConfig,
  type SelectorCandidate,
  type SelectorType,
} from '@web-monitor/shared';

export interface SelectionDraft {
  id: string;
  label: string;
  element: Element;
  selectorType: SelectorType;
  selector: string;
  selectorCandidates: SelectorCandidate[];
  matchCount: number;
  extractionMode: ExtractionMode;
  attributeName: string | null;
  matchMode: MatchMode;
  normalization: NormalizationConfig;
}

export function defaultExtractionModeFor(element: Element): ExtractionMode {
  const tag = element.tagName;
  if (tag === 'A') return 'link';
  if (tag === 'IMG') return 'image';
  return 'text';
}

const PREVIEW_MAX_LENGTH = 200;
const PREVIEW_LIST_ITEM_LIMIT = 3;

function resolveUrl(raw: string | null): string {
  if (!raw) return '';
  try {
    return new URL(raw, document.baseURI).toString();
  } catch {
    return raw;
  }
}

function extractRaw(element: Element, mode: ExtractionMode, attributeName: string | null): string {
  switch (mode) {
    case 'text':
      return element.textContent ?? '';
    case 'html':
      return element.innerHTML;
    case 'attribute':
      return attributeName ? (element.getAttribute(attributeName) ?? '') : '';
    case 'link':
      return resolveUrl(element.getAttribute('href'));
    case 'image':
      return resolveUrl((element as HTMLImageElement).currentSrc || element.getAttribute('src'));
    case 'list':
      return element.textContent ?? '';
  }
}

export function computePreview(
  draft: Pick<
    SelectionDraft,
    'selector' | 'selectorType' | 'extractionMode' | 'attributeName' | 'element'
  >,
): string {
  if (draft.extractionMode === 'list' && draft.selectorType === 'css' && draft.selector) {
    const items = Array.from(document.querySelectorAll(draft.selector)).slice(
      0,
      PREVIEW_LIST_ITEM_LIMIT,
    );
    const texts = items.map((el) => normalizeDefault(el.textContent ?? ''));
    const suffix = items.length < document.querySelectorAll(draft.selector).length ? ' ...' : '';
    return `[${texts.join(', ')}]${suffix}`.slice(0, PREVIEW_MAX_LENGTH);
  }
  const raw = extractRaw(draft.element, draft.extractionMode, draft.attributeName);
  return normalizeDefault(raw).slice(0, PREVIEW_MAX_LENGTH);
}

let counter = 0;
export function nextSelectionId(): string {
  counter += 1;
  return `selection-${Date.now()}-${counter}`;
}

export function createDraft(
  element: Element,
  candidates: SelectorCandidate[],
  best: SelectorCandidate | null,
  label: string,
  monitorMode: MonitorMode = 'single',
): SelectionDraft {
  // In list mode, a candidate that matched the repeating structure (more
  // than one element) should default to the 'list' extraction mode so the
  // Runner captures every item, not just the one that was clicked.
  const extractionMode =
    monitorMode === 'list' && best && best.matchCount > 1
      ? 'list'
      : defaultExtractionModeFor(element);
  return {
    id: nextSelectionId(),
    label,
    element,
    selectorType: 'css',
    selector: best?.selector ?? '',
    selectorCandidates: candidates,
    matchCount: best?.matchCount ?? 0,
    extractionMode,
    attributeName: null,
    matchMode: 'normalized',
    normalization: DEFAULT_NORMALIZATION_CONFIG,
  };
}

export function createFullPageDraft(label: string): SelectionDraft {
  return {
    id: nextSelectionId(),
    label,
    element: document.documentElement,
    selectorType: 'document',
    selector: '',
    selectorCandidates: [],
    matchCount: 1,
    extractionMode: 'text',
    attributeName: null,
    matchMode: 'normalized',
    normalization: DEFAULT_NORMALIZATION_CONFIG,
  };
}

export type { MonitorMode };
