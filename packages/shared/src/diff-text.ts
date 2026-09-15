/**
 * Fine-grained text diffing for a scalar Selection's before/after display
 * value.
 *
 * The older approach (diffScalarText) only trimmed the common prefix and
 * suffix, so it could describe exactly one contiguous changed region: as
 * soon as a page edited two separate spots — or, worse, removed one entry
 * from a list and shifted everything below it — every line between the
 * first and the last difference collapsed into a single "removed" blob,
 * even though most of those lines were identical on both sides.
 *
 * This module instead runs a real diff at two levels: first over lines, so
 * only genuinely changed lines are reported, then over word-level tokens
 * inside a pair of lines that clearly correspond, so a one-word edit shows
 * up as one word. Unchanged lines far from any edit are elided.
 *
 * Everything here is markup-agnostic: it returns plain text rows and the
 * caller decides how to render them (see formatScalarDiffHtml).
 */

/** Unchanged lines kept on either side of a changed line, for orientation. */
const CONTEXT_LINES = 5;

/**
 * Budgets that keep a pathological input from burning the Worker's CPU
 * allowance. Exceeding any of them is not an error: the caller falls back
 * to the coarse whole-value diff instead.
 */
const MAX_LINES = 4000;
const MAX_LINE_EDIT_DISTANCE = 600;
const MAX_TOKENS_PER_LINE = 20000;
const MAX_TOKEN_EDIT_DISTANCE = 1000;
/** Pairing is O(removed × added); past this many combinations we skip it. */
const MAX_PAIRING_COMBINATIONS = 400;
/** A removed/added line pair is only shown as one edited line above this similarity. */
const MIN_PAIRING_SIMILARITY = 0.4;

export interface TokenPart {
  type: 'equal' | 'removed' | 'added';
  text: string;
}

export type TextDiffRow =
  /** An unchanged line shown for orientation. */
  | { type: 'context'; text: string }
  /** A run of unchanged lines that was left out; `count` is how many. */
  | { type: 'elision'; count: number }
  /** A line present only in the old value. */
  | { type: 'removed'; text: string }
  /** A line present only in the new value. */
  | { type: 'added'; text: string }
  /** One line that was edited in place, broken down into word-level parts. */
  | { type: 'modified'; parts: TokenPart[] };

export interface TextDiff {
  changed: boolean;
  rows: TextDiffRow[];
  /**
   * True when the input exceeded one of the budgets above and no row-level
   * diff could be produced — callers should fall back to a coarser display.
   */
  overBudget: boolean;
}

type EditType = 'equal' | 'remove' | 'add';

interface Edit {
  type: EditType;
  aIndex: number;
  bIndex: number;
}

/**
 * Myers' O(ND) diff over two sequences, returning a per-element edit
 * script. Returns undefined once the edit distance exceeds `maxDistance`,
 * which bounds both the running time and the size of the backtracking
 * trace.
 */
function diffSequence(a: string[], b: string[], maxDistance: number): Edit[] | undefined {
  const n = a.length;
  const m = b.length;
  const limit = Math.min(maxDistance, n + m);
  const offset = limit;
  const size = 2 * limit + 1;
  let v = new Int32Array(size);
  const trace: Int32Array[] = [];

  for (let d = 0; d <= limit; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      const ki = k + offset;
      const left = v[ki - 1] ?? 0;
      const right = v[ki + 1] ?? 0;
      let x = k === -d || (k !== d && left < right) ? right : left + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[ki] = x;
      if (x >= n && y >= m) {
        return backtrack(trace, offset, d, n, m);
      }
    }
  }
  return undefined;
}

/** Walks the recorded per-round furthest-reaching paths back to the origin. */
function backtrack(
  trace: Int32Array[],
  offset: number,
  distance: number,
  n: number,
  m: number,
): Edit[] {
  const edits: Edit[] = [];
  let x = n;
  let y = m;

  for (let d = distance; d > 0; d--) {
    const v = trace[d];
    if (!v) break;
    const k = x - y;
    const left = v[k - 1 + offset] ?? 0;
    const right = v[k + 1 + offset] ?? 0;
    const prevK = k === -d || (k !== d && left < right) ? k + 1 : k - 1;
    const prevX = v[prevK + offset] ?? 0;
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      x--;
      y--;
      edits.push({ type: 'equal', aIndex: x, bIndex: y });
    }
    if (prevK === k + 1) {
      y--;
      edits.push({ type: 'add', aIndex: x, bIndex: y });
    } else {
      x--;
      edits.push({ type: 'remove', aIndex: x, bIndex: y });
    }
    x = prevX;
    y = prevY;
  }

  while (x > 0 && y > 0) {
    x--;
    y--;
    edits.push({ type: 'equal', aIndex: x, bIndex: y });
  }

  edits.reverse();
  return edits;
}

const SENTENCE_END = /[。！？]/;
const LATIN_SENTENCE_END = /[.!?]/;

/**
 * Splits a display value into the units the line-level diff compares.
 *
 * normalizeDisplay preserves the line breaks that existed in the source
 * markup, so most values already arrive as one line per list entry or
 * paragraph and split on "\n" alone. A value with no line break at all
 * (a section rendered as one long run of prose) would otherwise be a
 * single indivisible unit, so it is split into sentences instead — over-
 * splitting is harmless here, since identical units simply match up.
 */
export function splitIntoLines(value: string): string[] {
  const lines = value.split('\n');
  if (lines.length > 1) return lines;
  return splitIntoSentences(value);
}

function splitIntoSentences(value: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value[i] ?? '';
    const isBreak =
      SENTENCE_END.test(char) || (LATIN_SENTENCE_END.test(char) && /\s/.test(value[i + 1] ?? '\n'));
    if (!isBreak) continue;
    let end = i + 1;
    while (end < value.length && /\s/.test(value[end] ?? '')) end++;
    sentences.push(value.slice(start, end).trim());
    start = end;
    i = end - 1;
  }
  if (start < value.length) sentences.push(value.slice(start).trim());
  return sentences.filter((sentence) => sentence.length > 0);
}

// CJK characters carry meaning one character at a time and are not
// whitespace separated, so they are their own tokens; Latin script keeps
// whole words together. Whitespace runs are tokens too, which makes
// re-joining the tokens lossless.
const TOKEN_PATTERN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{Letter}\p{Number}_'’-]+|\s+|[^\s]/gu;

let wordSegmenter: Intl.Segmenter | null | undefined;

function getWordSegmenter(): Intl.Segmenter | null {
  if (wordSegmenter === undefined) {
    try {
      wordSegmenter = new Intl.Segmenter('ja', { granularity: 'word' });
    } catch {
      wordSegmenter = null;
    }
  }
  return wordSegmenter;
}

/**
 * Splits one line into word-level tokens. Uses Intl.Segmenter when the
 * runtime provides it, since word segmentation of Japanese needs a real
 * dictionary rather than whitespace; falls back to a script-aware regex
 * otherwise. Concatenating the result always reproduces the input.
 */
export function tokenizeLine(line: string): string[] {
  const segmenter = getWordSegmenter();
  if (segmenter) {
    const tokens: string[] = [];
    for (const { segment } of segmenter.segment(line)) tokens.push(segment);
    return tokens;
  }
  return line.match(TOKEN_PATTERN) ?? [];
}

/** Dice coefficient over the two token multisets, used to pair up lines. */
function similarity(aTokens: string[], bTokens: string[]): number {
  if (aTokens.length === 0 && bTokens.length === 0) return 1;
  const counts = new Map<string, number>();
  for (const token of aTokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  let shared = 0;
  for (const token of bTokens) {
    const remaining = counts.get(token) ?? 0;
    if (remaining > 0) {
      counts.set(token, remaining - 1);
      shared++;
    }
  }
  return (2 * shared) / (aTokens.length + bTokens.length);
}

/**
 * Every run of whitespace compares equal to every other, so a page that
 * only reflowed its markup — turning a space into a line break, or the
 * reverse — is not reported as an edit. The comparison value collapses
 * whitespace for the same reason: a reflow alone is not a content change.
 */
function tokenComparisonKey(token: string): string {
  return /^\s+$/.test(token) ? ' ' : token;
}

/**
 * Word-level diff of two corresponding lines. Unchanged tokens are taken
 * from the new side, so its spacing and line breaks are what gets rendered.
 * Returns undefined when the lines are too long to diff within budget, so
 * the caller can fall back to showing them as separate removed/added lines.
 */
function diffTokens(oldLine: string, newLine: string): TokenPart[] | undefined {
  const oldTokens = tokenizeLine(oldLine);
  const newTokens = tokenizeLine(newLine);
  if (oldTokens.length > MAX_TOKENS_PER_LINE || newTokens.length > MAX_TOKENS_PER_LINE) {
    return undefined;
  }
  const edits = diffSequence(
    oldTokens.map(tokenComparisonKey),
    newTokens.map(tokenComparisonKey),
    MAX_TOKEN_EDIT_DISTANCE,
  );
  if (!edits) return undefined;

  const parts: TokenPart[] = [];
  const append = (type: TokenPart['type'], text: string): void => {
    const last = parts[parts.length - 1];
    if (last && last.type === type) last.text += text;
    else parts.push({ type, text });
  };
  for (const edit of edits) {
    if (edit.type === 'equal') append('equal', newTokens[edit.bIndex] ?? '');
    else if (edit.type === 'remove') append('removed', oldTokens[edit.aIndex] ?? '');
    else append('added', newTokens[edit.bIndex] ?? '');
  }
  return parts;
}

interface Block {
  equal: string[];
  removed: string[];
  added: string[];
}

/** Groups the per-line edit script into alternating unchanged/changed blocks. */
function groupIntoBlocks(edits: Edit[], oldLines: string[], newLines: string[]): Block[] {
  const blocks: Block[] = [];
  let current: Block | undefined;
  let currentKind: 'equal' | 'changed' | undefined;
  for (const edit of edits) {
    const kind = edit.type === 'equal' ? 'equal' : 'changed';
    if (!current || currentKind !== kind) {
      current = { equal: [], removed: [], added: [] };
      currentKind = kind;
      blocks.push(current);
    }
    if (edit.type === 'equal') current.equal.push(oldLines[edit.aIndex] ?? '');
    else if (edit.type === 'remove') current.removed.push(oldLines[edit.aIndex] ?? '');
    else current.added.push(newLines[edit.bIndex] ?? '');
  }
  return blocks;
}

/**
 * Renders one changed block. Removed and added lines that clearly
 * correspond are shown once, with a word-level diff inside them; the rest
 * are shown as whole removed or added lines. Paired and unpaired removed
 * lines keep their original order, and any added line that found no
 * partner follows them.
 */
function rowsForChangedBlock(removed: string[], added: string[]): TextDiffRow[] {
  const rows: TextDiffRow[] = [];
  const partnerOf = new Map<number, number>();

  // When one side of the block is a single unit there is only one possible
  // correspondence, so it is always shown as an edit in place. This also
  // covers a value whose markup gained or lost its line breaks between
  // checks — one unbroken run of prose against many lines — where matching
  // line against line finds nothing and the word-level diff over the pair
  // is the only thing that can locate the real edit.
  const unambiguous = removed.length === 1 || added.length === 1;
  if (unambiguous && removed.length > 0 && added.length > 0) {
    const parts = diffTokens(removed.join('\n'), added.join('\n'));
    if (parts) return [{ type: 'modified', parts }];
  }

  if (removed.length * added.length <= MAX_PAIRING_COMBINATIONS) {
    const removedTokens = removed.map(tokenizeLine);
    const addedTokens = added.map(tokenizeLine);
    const claimed = new Set<number>();
    for (let i = 0; i < removed.length; i++) {
      let bestIndex = -1;
      let bestScore = MIN_PAIRING_SIMILARITY;
      for (let j = 0; j < added.length; j++) {
        if (claimed.has(j)) continue;
        const score = similarity(removedTokens[i] ?? [], addedTokens[j] ?? []);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = j;
        }
      }
      if (bestIndex >= 0) {
        claimed.add(bestIndex);
        partnerOf.set(i, bestIndex);
      }
    }
  }

  const pairedAdded = new Set(partnerOf.values());
  for (let i = 0; i < removed.length; i++) {
    const oldLine = removed[i] ?? '';
    const partner = partnerOf.get(i);
    const newLine = partner === undefined ? undefined : (added[partner] ?? '');
    const parts = newLine === undefined ? undefined : diffTokens(oldLine, newLine);
    if (parts) {
      rows.push({ type: 'modified', parts });
      continue;
    }
    rows.push({ type: 'removed', text: oldLine });
    if (newLine !== undefined) rows.push({ type: 'added', text: newLine });
  }
  for (let j = 0; j < added.length; j++) {
    if (pairedAdded.has(j)) continue;
    rows.push({ type: 'added', text: added[j] ?? '' });
  }
  return rows;
}

/** Emits an unchanged run, keeping only the lines near an adjacent change. */
function rowsForEqualBlock(
  lines: string[],
  hasChangeBefore: boolean,
  hasChangeAfter: boolean,
): TextDiffRow[] {
  const leading = hasChangeBefore ? Math.min(CONTEXT_LINES, lines.length) : 0;
  const trailing = hasChangeAfter ? Math.min(CONTEXT_LINES, lines.length - leading) : 0;
  const elided = lines.length - leading - trailing;
  const rows: TextDiffRow[] = [];
  for (let i = 0; i < leading; i++) rows.push({ type: 'context', text: lines[i] ?? '' });
  if (elided > 0) rows.push({ type: 'elision', count: elided });
  for (let i = lines.length - trailing; i < lines.length; i++) {
    rows.push({ type: 'context', text: lines[i] ?? '' });
  }
  return rows;
}

/**
 * Diffs two display values line by line, then word by word inside lines
 * that were edited rather than wholly replaced, returning only the changed
 * regions plus CONTEXT_LINES unchanged lines on either side.
 */
export function diffDisplayText(oldValue: string, newValue: string): TextDiff {
  if (oldValue === newValue) return { changed: false, rows: [], overBudget: false };

  const oldLines = splitIntoLines(oldValue);
  const newLines = splitIntoLines(newValue);
  if (oldLines.length + newLines.length > MAX_LINES) {
    return { changed: true, rows: [], overBudget: true };
  }

  const edits = diffSequence(oldLines, newLines, MAX_LINE_EDIT_DISTANCE);
  if (!edits) return { changed: true, rows: [], overBudget: true };

  const blocks = groupIntoBlocks(edits, oldLines, newLines);

  // Hardly any line survived intact. That happens when the page kept its
  // wording but changed where its line breaks fall, so every unit boundary
  // moved and matching line against line finds almost nothing; a word-level
  // diff over the whole value is then the only thing that can locate the
  // real edit, and it ignores which kind of whitespace separates the words.
  const alignedLines = blocks.reduce((total, block) => total + block.equal.length, 0);
  if (alignedLines * 2 < Math.min(oldLines.length, newLines.length)) {
    const parts = diffTokens(oldValue, newValue);
    if (parts) return { changed: true, rows: [{ type: 'modified', parts }], overBudget: false };
  }

  const rows: TextDiffRow[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block) continue;
    if (block.removed.length > 0 || block.added.length > 0) {
      rows.push(...rowsForChangedBlock(block.removed, block.added));
    } else {
      rows.push(...rowsForEqualBlock(block.equal, i > 0, i < blocks.length - 1));
    }
  }

  // Two identical values are caught above, so anything reaching here has at
  // least one edit — but a value whose only difference is trailing
  // whitespace can still diff down to nothing displayable.
  const changed = rows.some((row) => row.type !== 'context' && row.type !== 'elision');
  return { changed, rows, overBudget: false };
}
