import { z } from 'zod';

// Zero-width and other invisible formatting characters we strip during normalization.
// eslint-disable-next-line no-misleading-character-class -- literal zero-width codepoints, not a grapheme sequence
const ZERO_WIDTH_PATTERN = /[\u200B\u200C\u200D\u2060\uFEFF]/g;
// Non-breaking and other unicode space variants we fold into a plain space.
const NBSP_PATTERN = /[\u00A0\u202F\u2007]/g;
const MAX_REGEX_PATTERN_LENGTH = 200;
const MAX_REMOVE_STRINGS = 20;

export const normalizationConfigSchema = z
  .object({
    extractFirstNumber: z.boolean().default(false),
    parsePrice: z.boolean().default(false),
    regexPattern: z.string().max(MAX_REGEX_PATTERN_LENGTH).optional(),
    regexFlags: z
      .string()
      .max(4)
      .regex(/^[gimsuy]*$/)
      .optional(),
    removeStrings: z.array(z.string().max(200)).max(MAX_REMOVE_STRINGS).default([]),
    caseInsensitive: z.boolean().default(false),
  })
  .strict();

export type NormalizationConfig = z.infer<typeof normalizationConfigSchema>;

export const DEFAULT_NORMALIZATION_CONFIG: NormalizationConfig = {
  extractFirstNumber: false,
  parsePrice: false,
  removeStrings: [],
  caseInsensitive: false,
};

/**
 * Baseline cleanup applied to every extracted text value before display or comparison:
 * fold non-breaking spaces, drop zero-width characters, trim, and collapse runs of whitespace.
 */
export function normalizeDefault(raw: string): string {
  return raw.replace(NBSP_PATTERN, ' ').replace(ZERO_WIDTH_PATTERN, '').replace(/\s+/g, ' ').trim();
}

const FIRST_NUMBER_PATTERN = /-?\d[\d,]*(?:\.\d+)?/;
const PRICE_PATTERN = /([^\d\s]*)\s*(-?\d[\d,]*(?:\.\d+)?)\s*([^\d\s]*)/;

function extractFirstNumber(value: string): string {
  const match = FIRST_NUMBER_PATTERN.exec(value);
  return match ? match[0].replace(/,/g, '') : value;
}

function parsePrice(value: string): string {
  const match = PRICE_PATTERN.exec(value);
  if (!match) return value;
  const [, prefix, amount, suffix] = match;
  const currency = (prefix ?? suffix ?? '').trim();
  const numeric = (amount ?? '').replace(/,/g, '');
  return currency ? `${currency} ${numeric}` : numeric;
}

function applyRegex(value: string, pattern: string, flags: string | undefined): string {
  try {
    const re = new RegExp(pattern, flags ?? '');
    const match = re.exec(value);
    return match ? match[0] : value;
  } catch {
    // An invalid pattern must never crash normalization; fall back to the input value.
    return value;
  }
}

/**
 * Comparison-oriented normalization: applies the default cleanup, then the
 * selection's configured rules in a fixed, predictable order.
 */
export function normalizeForComparison(
  raw: string,
  config: NormalizationConfig = DEFAULT_NORMALIZATION_CONFIG,
): string {
  let value = normalizeDefault(raw);

  for (const remove of config.removeStrings) {
    if (remove.length === 0) continue;
    value = value.split(remove).join('');
  }
  value = normalizeDefault(value);

  if (config.regexPattern) {
    value = applyRegex(value, config.regexPattern, config.regexFlags);
  }

  if (config.parsePrice) {
    value = parsePrice(value);
  } else if (config.extractFirstNumber) {
    value = extractFirstNumber(value);
  }

  if (config.caseInsensitive) {
    value = value.toLowerCase();
  }

  return value;
}

export interface NormalizedValue {
  displayValue: string;
  comparisonValue: string;
}

export function normalizeValue(
  raw: string,
  config: NormalizationConfig = DEFAULT_NORMALIZATION_CONFIG,
): NormalizedValue {
  return {
    displayValue: normalizeDefault(raw),
    comparisonValue: normalizeForComparison(raw, config),
  };
}
