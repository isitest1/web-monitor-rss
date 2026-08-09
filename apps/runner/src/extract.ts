import type { Locator, Page } from 'playwright';
import {
  HTML_EXTRACTION_MAX_LENGTH,
  normalizeValue,
  type ExtractedSelectionValue,
  type Selection,
} from '@web-monitor/shared';
import { RunnerCheckError } from './errors.js';

const SELECTOR_WAIT_TIMEOUT_MS = 10_000;

function resolveAbsoluteUrl(raw: string | null, pageUrl: string): string {
  if (!raw) return '';
  try {
    return new URL(raw, pageUrl).toString();
  } catch {
    return raw;
  }
}

async function locatorFor(page: Page, selection: Selection): Promise<Locator> {
  if (selection.selectorType === 'document') {
    return page.locator(':root');
  }
  return page.locator(selection.selector);
}

async function waitForAtLeastOneMatch(locator: Locator): Promise<void> {
  await locator
    .first()
    .waitFor({ state: 'attached', timeout: SELECTOR_WAIT_TIMEOUT_MS })
    .catch(() => undefined);
}

async function extractOne(
  locator: Locator,
  selection: Selection,
  pageUrl: string,
): Promise<string> {
  switch (selection.extractionMode) {
    case 'text': {
      return (await locator.textContent()) ?? '';
    }
    case 'html': {
      const html = await locator.innerHTML();
      if (html.length > HTML_EXTRACTION_MAX_LENGTH) {
        throw new RunnerCheckError(
          'CONTENT_TOO_LARGE',
          `extracted HTML exceeds ${HTML_EXTRACTION_MAX_LENGTH} characters`,
        );
      }
      return html;
    }
    case 'attribute': {
      if (!selection.attributeName) return '';
      return (await locator.getAttribute(selection.attributeName)) ?? '';
    }
    case 'link': {
      const href = await locator.getAttribute('href');
      return resolveAbsoluteUrl(href, pageUrl);
    }
    case 'image': {
      const currentSrc = await locator
        .evaluate((el) => (el as HTMLImageElement).currentSrc || '')
        .catch(() => '');
      if (currentSrc) return currentSrc;
      const src = await locator.getAttribute('src');
      return resolveAbsoluteUrl(src, pageUrl);
    }
    case 'list':
      throw new Error('extractOne must not be called for list extraction mode');
  }
}

export async function extractSelection(
  page: Page,
  selection: Selection,
): Promise<ExtractedSelectionValue> {
  const locator = await locatorFor(page, selection);
  await waitForAtLeastOneMatch(locator);
  const count = await locator.count();

  if (count === 0) {
    throw new RunnerCheckError(
      'SELECTOR_NOT_FOUND',
      `no element matched selector for "${selection.label}"`,
    );
  }

  if (selection.extractionMode === 'list') {
    const items = await locator.all();
    const rawValues = await Promise.all(items.map((item) => extractListItem(item)));
    const normalized = rawValues.map((raw) => normalizeValue(raw, selection.normalization));
    return {
      selectionId: selection.id,
      label: selection.label,
      displayValue: normalized.map((n) => n.displayValue),
      comparisonValue: normalized.map((n) => n.comparisonValue),
    };
  }

  if (count > 1) {
    throw new RunnerCheckError(
      'SELECTOR_NOT_UNIQUE',
      `selector for "${selection.label}" matched ${count} elements, expected exactly 1`,
    );
  }

  const raw = await extractOne(locator, selection, page.url());
  const normalized = normalizeValue(raw, selection.normalization);
  return {
    selectionId: selection.id,
    label: selection.label,
    displayValue: normalized.displayValue,
    comparisonValue: normalized.comparisonValue,
  };
}

async function extractListItem(item: Locator): Promise<string> {
  return (await item.textContent()) ?? '';
}

export async function extractAllSelections(
  page: Page,
  selections: Selection[],
): Promise<ExtractedSelectionValue[]> {
  const values: ExtractedSelectionValue[] = [];
  for (const selection of selections) {
    values.push(await extractSelection(page, selection));
  }
  return values;
}
