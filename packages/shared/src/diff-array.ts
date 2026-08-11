export interface ArrayDiff {
  added: string[];
  removed: string[];
}

/**
 * Compares two arrays of display strings (a list-mode Selection's before/
 * after values) and returns which entries are new vs. gone, so a repeating-
 * structure change can surface what's actually new instead of dumping the
 * whole before/after list. Order-insensitive: a pure reordering yields no
 * added/removed entries.
 */
export function diffArrayValues(oldValues: string[] | undefined, newValues: string[]): ArrayDiff {
  const oldSet = new Set(oldValues ?? []);
  const newSet = new Set(newValues);
  return {
    added: newValues.filter((v) => !oldSet.has(v)),
    removed: (oldValues ?? []).filter((v) => !newSet.has(v)),
  };
}
