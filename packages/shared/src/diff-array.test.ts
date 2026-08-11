import { describe, expect, it } from 'vitest';
import { diffArrayValues } from './diff-array.js';

describe('diffArrayValues', () => {
  it('reports newly added entries', () => {
    const result = diffArrayValues(['A', 'B'], ['A', 'B', 'C']);
    expect(result.added).toEqual(['C']);
    expect(result.removed).toEqual([]);
  });

  it('reports removed entries', () => {
    const result = diffArrayValues(['A', 'B', 'C'], ['A', 'B']);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual(['C']);
  });

  it('reports both added and removed entries', () => {
    const result = diffArrayValues(['A', 'B'], ['B', 'C']);
    expect(result.added).toEqual(['C']);
    expect(result.removed).toEqual(['A']);
  });

  it('reports neither when the set of values is unchanged (even if reordered)', () => {
    const result = diffArrayValues(['A', 'B'], ['B', 'A']);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('treats an undefined previous value as "everything is new"', () => {
    const result = diffArrayValues(undefined, ['A', 'B']);
    expect(result.added).toEqual(['A', 'B']);
    expect(result.removed).toEqual([]);
  });
});
