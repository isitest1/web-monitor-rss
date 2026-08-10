import {
  HTML_EXTRACTION_MAX_LENGTH,
  normalizeValue,
  type ExtractedSelectionValue,
  type Selection,
  type StatusCode,
} from '@web-monitor/shared';

const SELECTOR_WAIT_TIMEOUT_MS = 10_000;
const SELECTOR_POLL_INTERVAL_MS = 200;

/**
 * DOM-based counterpart to Runner's RunnerCheckError (apps/runner/src/errors.ts):
 * carries an explicit StatusCode so @web-monitor/shared's classifyException
 * passes it through unchanged regardless of which extractor threw it.
 */
export class SelectionExtractionError extends Error {
  readonly statusCode: StatusCode;

  constructor(statusCode: StatusCode, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'SelectionExtractionError';
  }
}

function resolveAbsoluteUrl(raw: string | null): string {
  if (!raw) return '';
  try {
    return new URL(raw, document.baseURI).toString();
  } catch {
    return raw;
  }
}

function queryAll(selection: Selection): Element[] {
  if (selection.selectorType === 'document') {
    return [document.documentElement];
  }
  try {
    return Array.from(document.querySelectorAll(selection.selector));
  } catch {
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Mirrors Runner's waitForAtLeastOneMatch (apps/runner/src/extract.ts): gives late-rendering content up to 10s to appear before declaring SELECTOR_NOT_FOUND. */
async function waitForAtLeastOneMatch(selection: Selection): Promise<Element[]> {
  const deadline = Date.now() + SELECTOR_WAIT_TIMEOUT_MS;
  let matches = queryAll(selection);
  while (matches.length === 0 && Date.now() < deadline) {
    await sleep(SELECTOR_POLL_INTERVAL_MS);
    matches = queryAll(selection);
  }
  return matches;
}

function extractOne(element: Element, selection: Selection): string {
  switch (selection.extractionMode) {
    case 'text':
      return element.textContent ?? '';
    case 'html': {
      const html = element.innerHTML;
      if (html.length > HTML_EXTRACTION_MAX_LENGTH) {
        throw new SelectionExtractionError(
          'CONTENT_TOO_LARGE',
          `extracted HTML exceeds ${HTML_EXTRACTION_MAX_LENGTH} characters`,
        );
      }
      return html;
    }
    case 'attribute':
      if (!selection.attributeName) return '';
      return element.getAttribute(selection.attributeName) ?? '';
    case 'link':
      return resolveAbsoluteUrl(element.getAttribute('href'));
    case 'image': {
      const currentSrc = element instanceof HTMLImageElement ? element.currentSrc : '';
      if (currentSrc) return currentSrc;
      return resolveAbsoluteUrl(element.getAttribute('src'));
    }
    case 'list':
      throw new Error('extractOne must not be called for list extraction mode');
  }
}

function extractListItem(element: Element): string {
  return element.textContent ?? '';
}

export async function extractSelectionFromDom(
  selection: Selection,
): Promise<ExtractedSelectionValue> {
  const matches = await waitForAtLeastOneMatch(selection);

  if (matches.length === 0) {
    throw new SelectionExtractionError(
      'SELECTOR_NOT_FOUND',
      `no element matched selector for "${selection.label}"`,
    );
  }

  if (selection.extractionMode === 'list') {
    const rawValues = matches.map((element) => extractListItem(element));
    const normalized = rawValues.map((raw) => normalizeValue(raw, selection.normalization));
    return {
      selectionId: selection.id,
      label: selection.label,
      displayValue: normalized.map((n) => n.displayValue),
      comparisonValue: normalized.map((n) => n.comparisonValue),
    };
  }

  if (matches.length > 1) {
    throw new SelectionExtractionError(
      'SELECTOR_NOT_UNIQUE',
      `selector for "${selection.label}" matched ${matches.length} elements, expected exactly 1`,
    );
  }

  const [element] = matches;
  if (!element) {
    throw new SelectionExtractionError(
      'SELECTOR_NOT_FOUND',
      `no element matched selector for "${selection.label}"`,
    );
  }
  const raw = extractOne(element, selection);
  const normalized = normalizeValue(raw, selection.normalization);
  return {
    selectionId: selection.id,
    label: selection.label,
    displayValue: normalized.displayValue,
    comparisonValue: normalized.comparisonValue,
  };
}

export async function extractAllSelectionsFromDom(
  selections: Selection[],
): Promise<ExtractedSelectionValue[]> {
  const values: ExtractedSelectionValue[] = [];
  for (const selection of selections) {
    values.push(await extractSelectionFromDom(selection));
  }
  return values;
}
