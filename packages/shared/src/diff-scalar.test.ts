import { describe, expect, it } from 'vitest';
import { diffScalarText } from './diff-scalar.js';

describe('diffScalarText', () => {
  it('reports unchanged when the values are identical', () => {
    const result = diffScalarText('価格: ¥1,980', '価格: ¥1,980');
    expect(result.changed).toBe(false);
  });

  it('isolates a middle replacement with surrounding context', () => {
    // Note: the trailing "80" is part of both numbers, so it is correctly
    // absorbed into the shared suffix rather than the diffed portion.
    const result = diffScalarText('価格: ¥1,980（税込）', '価格: ¥2,480（税込）');
    expect(result.changed).toBe(true);
    expect(result.removed).toBe('1,9');
    expect(result.added).toBe('2,4');
    expect(result.contextBefore).toBe('価格: ¥');
    expect(result.contextAfter).toBe('80（税込）');
  });

  it('detects a pure addition at the end', () => {
    const result = diffScalarText('こんにちは', 'こんにちは、世界');
    expect(result.removed).toBe('');
    expect(result.added).toBe('、世界');
  });

  it('detects a pure deletion', () => {
    const result = diffScalarText('こんにちは、世界', 'こんにちは');
    expect(result.removed).toBe('、世界');
    expect(result.added).toBe('');
  });

  it('falls back to the whole values when nothing is shared', () => {
    const result = diffScalarText('abc', 'xyz');
    expect(result.removed).toBe('abc');
    expect(result.added).toBe('xyz');
    expect(result.contextBefore).toBe('');
    expect(result.contextAfter).toBe('');
  });

  it('truncates long unchanged context with an ellipsis marker', () => {
    const longPrefix = 'あ'.repeat(50);
    const longSuffix = 'い'.repeat(50);
    const result = diffScalarText(`${longPrefix}X${longSuffix}`, `${longPrefix}Y${longSuffix}`);
    expect(result.removed).toBe('X');
    expect(result.added).toBe('Y');
    expect(result.contextBefore.startsWith('…')).toBe(true);
    expect(result.contextBefore.length).toBe(31); // 30 chars + ellipsis marker
    expect(result.contextAfter.endsWith('…')).toBe(true);
    expect(result.contextAfter.length).toBe(31);
  });

  it('does not split a multi-code-point character (e.g. emoji) across the diff boundary', () => {
    // "🎉" is a single code point but 2 UTF-16 code units; Array.from
    // iterates by code point, so it must never be torn in half.
    const result = diffScalarText('前🎉後', '前🎊後');
    expect(result.removed).toBe('🎉');
    expect(result.added).toBe('🎊');
    expect(result.contextBefore).toBe('前');
    expect(result.contextAfter).toBe('後');
  });
});
