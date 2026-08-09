import { describe, expect, it } from 'vitest';
import { normalizeDefault, normalizeForComparison, normalizeValue } from './normalize.js';

describe('normalizeDefault', () => {
  it('collapses whitespace and trims', () => {
    expect(normalizeDefault('  hello   world  ')).toBe('hello world');
  });

  it('converts non-breaking spaces to normal spaces', () => {
    expect(normalizeDefault('hello world')).toBe('hello world');
  });

  it('removes zero-width characters', () => {
    expect(normalizeDefault('hel​lo')).toBe('hello');
  });

  it('collapses newlines and tabs into a single space', () => {
    expect(normalizeDefault('line1\n\tline2')).toBe('line1 line2');
  });
});

describe('normalizeForComparison', () => {
  it('extracts the first number when configured', () => {
    const result = normalizeForComparison('在庫: 42 個', {
      extractFirstNumber: true,
      parsePrice: false,
      removeStrings: [],
      caseInsensitive: false,
    });
    expect(result).toBe('42');
  });

  it('parses a price while preserving currency', () => {
    const result = normalizeForComparison('価格: ¥1,980 (税込)', {
      extractFirstNumber: false,
      parsePrice: true,
      removeStrings: [],
      caseInsensitive: false,
    });
    expect(result).toBe('¥ 1980');
  });

  it('removes configured fixed strings', () => {
    const result = normalizeForComparison('SALE New Product SALE', {
      extractFirstNumber: false,
      parsePrice: false,
      removeStrings: ['SALE'],
      caseInsensitive: false,
    });
    expect(result).toBe('New Product');
  });

  it('applies a length-limited regex to extract a substring', () => {
    const result = normalizeForComparison('order #A1234 confirmed', {
      extractFirstNumber: false,
      parsePrice: false,
      removeStrings: [],
      caseInsensitive: false,
      regexPattern: '#[A-Z0-9]+',
    });
    expect(result).toBe('#A1234');
  });

  it('falls back to the input on an invalid regex instead of throwing', () => {
    const result = normalizeForComparison('abc', {
      extractFirstNumber: false,
      parsePrice: false,
      removeStrings: [],
      caseInsensitive: false,
      regexPattern: '(',
    });
    expect(result).toBe('abc');
  });

  it('lowercases when caseInsensitive is set', () => {
    const result = normalizeForComparison('Hello WORLD', {
      extractFirstNumber: false,
      parsePrice: false,
      removeStrings: [],
      caseInsensitive: true,
    });
    expect(result).toBe('hello world');
  });
});

describe('normalizeValue', () => {
  it('returns both a display value and a comparison value', () => {
    const result = normalizeValue('  Price: $10.00  ', {
      extractFirstNumber: false,
      parsePrice: false,
      removeStrings: [],
      caseInsensitive: true,
    });
    expect(result.displayValue).toBe('Price: $10.00');
    expect(result.comparisonValue).toBe('price: $10.00');
  });
});
