import { describe, expect, it } from 'vitest';
import { diffDisplayText, splitIntoLines, tokenizeLine, type TextDiffRow } from './diff-text.js';

const lines = (...values: string[]): string => values.join('\n');

function textOf(row: TextDiffRow): string {
  switch (row.type) {
    case 'elision':
      return `…${row.count}`;
    case 'modified':
      return row.parts.map((part) => part.text).join('');
    default:
      return row.text;
  }
}

function rowsOfType(rows: TextDiffRow[], type: TextDiffRow['type']): TextDiffRow[] {
  return rows.filter((row) => row.type === type);
}

describe('splitIntoLines', () => {
  it('splits on the line breaks normalizeDisplay preserved', () => {
    expect(splitIntoLines('a\nb\nc')).toEqual(['a', 'b', 'c']);
  });

  it('falls back to sentence splitting when the value has no line break at all', () => {
    expect(splitIntoLines('一つ目です。二つ目です。')).toEqual(['一つ目です。', '二つ目です。']);
  });

  it('splits Latin sentences only at a terminator followed by whitespace', () => {
    expect(splitIntoLines('Rev. 2 applies. Next one.')).toEqual([
      'Rev.',
      '2 applies.',
      'Next one.',
    ]);
  });

  it('keeps a single sentence with no terminator as one unit', () => {
    expect(splitIntoLines('no terminator here')).toEqual(['no terminator here']);
  });
});

describe('tokenizeLine', () => {
  it('reproduces the input when the tokens are concatenated back together', () => {
    for (const line of [
      '価格は1,000円です',
      'Hello, world! 42',
      '東京・大久保 東京カレー万博 2026',
    ]) {
      expect(tokenizeLine(line).join('')).toBe(line);
    }
  });

  it('splits Japanese text into more than one token despite the absence of spaces', () => {
    expect(tokenizeLine('これは日本語です').length).toBeGreaterThan(1);
  });
});

describe('diffDisplayText', () => {
  it('reports nothing changed for identical values', () => {
    const diff = diffDisplayText('same', 'same');
    expect(diff.changed).toBe(false);
    expect(diff.rows).toEqual([]);
  });

  it('reports two separate edits separately instead of swallowing everything between them', () => {
    // The whole point of the line-level diff: the old prefix/suffix trim
    // could only describe one contiguous region, so the eight untouched
    // lines between these two edits were reported as changed too.
    const before = lines('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j');
    const after = lines('A', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'J');
    const diff = diffDisplayText(before, after);

    expect(diff.changed).toBe(true);
    const changedText = diff.rows
      .filter((row) => row.type === 'modified' || row.type === 'removed' || row.type === 'added')
      .map(textOf);
    expect(changedText).toEqual(['aA', 'jJ']);
    expect(rowsOfType(diff.rows, 'context').map(textOf)).toEqual([
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
      'i',
    ]);
  });

  it('reports only the dropped entry when a list loses one line and the rest shifts up', () => {
    const before = lines('x1', 'x2', 'x3', 'x4', 'x5', 'x6');
    const after = lines('x2', 'x3', 'x4', 'x5', 'x6');
    const diff = diffDisplayText(before, after);

    expect(rowsOfType(diff.rows, 'removed').map(textOf)).toEqual(['x1']);
    expect(rowsOfType(diff.rows, 'added')).toEqual([]);
    expect(rowsOfType(diff.rows, 'modified')).toEqual([]);
  });

  it('keeps five unchanged lines either side of an edit and elides the rest with a count', () => {
    const before = Array.from({ length: 30 }, (_, i) => `line ${i}`);
    const after = [...before];
    after[15] = 'line fifteen changed';
    const diff = diffDisplayText(before.join('\n'), after.join('\n'));

    expect(rowsOfType(diff.rows, 'context').map(textOf)).toEqual([
      'line 10',
      'line 11',
      'line 12',
      'line 13',
      'line 14',
      'line 16',
      'line 17',
      'line 18',
      'line 19',
      'line 20',
    ]);
    const elisions = diff.rows.flatMap((row) => (row.type === 'elision' ? [row.count] : []));
    expect(elisions).toEqual([10, 9]);
  });

  it('shows an edited line once, with only the changed word marked', () => {
    const diff = diffDisplayText(
      lines('unchanged', 'the quick brown fox', 'also unchanged'),
      lines('unchanged', 'the quick red fox', 'also unchanged'),
    );
    const modified = diff.rows.filter((row) => row.type === 'modified');
    expect(modified).toHaveLength(1);
    const parts = modified[0]?.type === 'modified' ? modified[0].parts : [];
    expect(parts.filter((part) => part.type === 'removed').map((part) => part.text)).toEqual([
      'brown',
    ]);
    expect(parts.filter((part) => part.type === 'added').map((part) => part.text)).toEqual(['red']);
    expect(parts.map((part) => part.text).join('')).toBe('the quick brownred fox');
  });

  it('marks only the changed characters of a Japanese sentence', () => {
    const diff = diffDisplayText(
      'これは最初の文です。これは二番目の文です。これは三番目の文です。',
      'これは最初の文です。これは二番目の文だ。これは三番目の文です。',
    );
    const modified = diff.rows.filter((row) => row.type === 'modified');
    expect(modified).toHaveLength(1);
    const parts = modified[0]?.type === 'modified' ? modified[0].parts : [];
    expect(
      parts
        .filter((part) => part.type === 'removed')
        .map((part) => part.text)
        .join(''),
    ).toBe('です');
    expect(
      parts
        .filter((part) => part.type === 'added')
        .map((part) => part.text)
        .join(''),
    ).toBe('だ');
  });

  it('pairs a single replaced line even when the replacement shares nothing with it', () => {
    const diff = diffDisplayText('あり', 'なし');
    expect(diff.rows).toHaveLength(1);
    expect(diff.rows[0]?.type).toBe('modified');
    expect(textOf(diff.rows[0]!)).toBe('ありなし');
  });

  it('shows unrelated removals and additions as whole lines when a block holds several', () => {
    const diff = diffDisplayText(
      lines('head', 'alpha', 'beta', 'tail'),
      lines('head', 'gamma', 'delta', 'epsilon', 'tail'),
    );
    expect(rowsOfType(diff.rows, 'removed').map(textOf)).toEqual(['alpha', 'beta']);
    expect(rowsOfType(diff.rows, 'added').map(textOf)).toEqual(['gamma', 'delta', 'epsilon']);
    expect(rowsOfType(diff.rows, 'modified')).toEqual([]);
  });

  it('still lines up two values that disagree about where their line breaks fall', () => {
    // Seen in a real feed: the monitored page kept its wording but started
    // rendering the section with line breaks, so one side arrived as one
    // unbroken run of prose and the other as many lines.
    const before = 'First sentence here. Second sentence here. Third sentence here.';
    const after = 'First sentence here.\nSecond sentence changed.\nThird sentence here.';
    const diff = diffDisplayText(before, after);

    expect(diff.overBudget).toBe(false);
    const modified = diff.rows.filter((row) => row.type === 'modified');
    expect(modified).toHaveLength(1);
    const parts = modified[0]?.type === 'modified' ? modified[0].parts : [];
    expect(parts.filter((part) => part.type === 'added').map((part) => part.text)).toEqual([
      'changed',
    ]);
    expect(rowsOfType(diff.rows, 'context').map(textOf)).toEqual([
      'First sentence here.',
      'Third sentence here.',
    ]);
  });

  it('locates the real edit when the page kept its wording but moved its line breaks', () => {
    // Seen in a real feed: the monitored section started rendering with
    // line breaks where it previously ran on. Matching line against line
    // finds almost nothing, so the whole value is diffed word by word, and
    // whitespace of any kind compares equal so the reflow itself is not
    // reported.
    const before = 'alpha beta gamma OLD delta epsilon';
    const after = 'alpha beta\ngamma NEW delta\nepsilon';
    const diff = diffDisplayText(before, after);

    expect(diff.overBudget).toBe(false);
    expect(diff.rows).toHaveLength(1);
    const parts = diff.rows[0]?.type === 'modified' ? diff.rows[0].parts : [];
    expect(parts.filter((part) => part.type === 'removed').map((part) => part.text)).toEqual([
      'OLD',
    ]);
    expect(parts.filter((part) => part.type === 'added').map((part) => part.text)).toEqual(['NEW']);
    // Unchanged tokens come from the new side, so its line breaks are what
    // gets rendered.
    expect(
      parts
        .filter((part) => part.type === 'equal')
        .map((part) => part.text)
        .join(''),
    ).toBe('alpha beta\ngamma  delta\nepsilon');
  });

  it('reports over budget instead of spending unbounded CPU on two wholly different values', () => {
    const before = Array.from({ length: 900 }, (_, i) => `alpha ${i}`).join('\n');
    const after = Array.from({ length: 900 }, (_, i) => `beta ${i}`).join('\n');
    const diff = diffDisplayText(before, after);
    expect(diff.overBudget).toBe(true);
    expect(diff.rows).toEqual([]);
  });

  it('stays fast on a long list that lost one block of entries', () => {
    const before: string[] = [];
    for (let day = 1; day <= 20; day++) {
      before.push(`2026/9/${day}`);
      for (let i = 0; i < 8; i++) before.push(`1${i}:00 event ${day}-${i}`);
    }
    const after = before.slice(9);
    const started = Date.now();
    const diff = diffDisplayText(before.join('\n'), after.join('\n'));
    expect(Date.now() - started).toBeLessThan(1000);
    expect(diff.overBudget).toBe(false);
    expect(rowsOfType(diff.rows, 'removed')).toHaveLength(9);
    expect(rowsOfType(diff.rows, 'added')).toEqual([]);
  });
});
