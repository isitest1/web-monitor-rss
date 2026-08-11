export interface ScalarDiff {
  changed: boolean;
  /** A little unchanged text right before the edit, for orientation (possibly truncated with a leading "…"). */
  contextBefore: string;
  removed: string;
  added: string;
  /** A little unchanged text right after the edit, for orientation (possibly truncated with a trailing "…"). */
  contextAfter: string;
}

const MAX_CONTEXT_CHARS = 30;

function trimFromStart(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `…${text.slice(text.length - maxLength)}`;
}

function trimFromEnd(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

/**
 * Trims the longest common prefix/suffix between two scalar (non-array,
 * single-value) Selection values, so a long text's one edited portion can
 * be shown without dumping the whole before/after value in the RSS/history
 * description — the same "show what actually changed" intent as
 * diffArrayValues, applied to plain text instead of list items.
 *
 * Uses Array.from for code-point iteration so multi-byte characters (emoji,
 * combining marks) never get split across the prefix/suffix boundary.
 */
export function diffScalarText(oldValue: string, newValue: string): ScalarDiff {
  if (oldValue === newValue) {
    return { changed: false, contextBefore: '', removed: '', added: '', contextAfter: '' };
  }

  const oldChars = Array.from(oldValue);
  const newChars = Array.from(newValue);

  const maxPrefix = Math.min(oldChars.length, newChars.length);
  let prefixLen = 0;
  while (prefixLen < maxPrefix && oldChars[prefixLen] === newChars[prefixLen]) {
    prefixLen++;
  }

  const maxSuffix = Math.min(oldChars.length, newChars.length) - prefixLen;
  let suffixLen = 0;
  while (
    suffixLen < maxSuffix &&
    oldChars[oldChars.length - 1 - suffixLen] === newChars[newChars.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const removed = oldChars.slice(prefixLen, oldChars.length - suffixLen).join('');
  const added = newChars.slice(prefixLen, newChars.length - suffixLen).join('');
  const prefixText = oldChars.slice(0, prefixLen).join('');
  const suffixText = suffixLen > 0 ? oldChars.slice(oldChars.length - suffixLen).join('') : '';

  return {
    changed: true,
    contextBefore: trimFromStart(prefixText, MAX_CONTEXT_CHARS),
    removed,
    added,
    contextAfter: trimFromEnd(suffixText, MAX_CONTEXT_CHARS),
  };
}
