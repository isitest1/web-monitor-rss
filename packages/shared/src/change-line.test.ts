import { describe, expect, it } from 'vitest';
import { formatChangeLineHtml, formatScalarDiffHtml } from './change-line.js';

const escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');

const REMOVED = 'color:#b91c1c;text-decoration:line-through;';
const ADDED = 'color:#15803d;';

describe('formatScalarDiffHtml', () => {
  it('marks only the changed word, leaving the rest of the line plain', () => {
    const html = formatScalarDiffHtml('価格: 1,000円', '価格: 1,100円', escape);
    expect(html).toBe(
      `価格: <span style="${REMOVED}">1,000</span><strong style="${ADDED}">1,100</strong>円`,
    );
  });

  it('escapes markup characters found inside the diffed text', () => {
    const html = formatScalarDiffHtml('<script>', 'safe', escape);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain(`<strong style="${ADDED}">safe</strong>`);
  });

  it('highlights a pure addition with only the added markup present', () => {
    const html = formatScalarDiffHtml('Hello', 'Hello world', escape);
    expect(html).toBe(`Hello<strong style="${ADDED}"> world</strong>`);
  });

  it('highlights a pure deletion with only the removed markup present', () => {
    const html = formatScalarDiffHtml('Hello world', 'Hello', escape);
    expect(html).toBe(`Hello<span style="${REMOVED}"> world</span>`);
  });

  it('returns the escaped value unchanged when nothing differs', () => {
    expect(formatScalarDiffHtml('same', 'same', escape)).toBe('same');
  });

  it('reports only the edited line of a multi-line value, keeping the rest as context', () => {
    const before = ['first', 'second', 'third old', 'fourth'].join('\n');
    const after = ['first', 'second', 'third new', 'fourth'].join('\n');
    const html = formatScalarDiffHtml(before, after, escape);
    expect(html).toBe(
      `first<br/>second<br/>third <span style="${REMOVED}">old</span>` +
        `<strong style="${ADDED}">new</strong><br/>fourth`,
    );
  });

  it('elides unchanged lines that are far from any edit, stating how many were left out', () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i}`);
    const after = [...before];
    after[10] = 'line ten changed';
    const html = formatScalarDiffHtml(before.join('\n'), after.join('\n'), escape);

    expect(html).toContain('… (5 unchanged lines)');
    expect(html).toContain('line 5');
    expect(html).not.toContain('line 4<');
    expect(html).toContain(`<strong style="${ADDED}">ten changed</strong>`);
  });

  it('writes a single elided line in the singular', () => {
    const before = Array.from({ length: 7 }, (_, i) => `line ${i}`);
    const after = [...before];
    after[0] = 'line zero changed';
    const html = formatScalarDiffHtml(before.join('\n'), after.join('\n'), escape);
    expect(html).toContain('… (1 unchanged line)');
    expect(html).not.toContain('unchanged lines');
  });

  it('falls back to the coarse prefix/suffix diff when the value is too large to diff by line', () => {
    const before = Array.from({ length: 900 }, (_, i) => `alpha ${i}`).join('\n');
    const after = Array.from({ length: 900 }, (_, i) => `beta ${i}`).join('\n');
    const html = formatScalarDiffHtml(before, after, escape);
    // The coarse renderer brackets the one contiguous changed region.
    expect(html).toContain('[');
    expect(html).toContain(`<span style="${REMOVED}">`);
    expect(html).toContain(`<strong style="${ADDED}">`);
  });
});

describe('formatChangeLineHtml', () => {
  it("highlights a scalar Selection's changed words only in 'both' mode", () => {
    const line = formatChangeLineHtml('値', '100円', '200円', false, 'both', escape);
    expect(line).toBe(`<span style="${REMOVED}">100</span><strong style="${ADDED}">200</strong>円`);
  });

  it("shows just the new value with no highlighting in 'new_only' mode", () => {
    const line = formatChangeLineHtml('値', '100円', '200円', false, 'new_only', escape);
    expect(line).toBe('200円');
    expect(line).not.toContain('<strong');
    expect(line).not.toContain('<span');
  });

  it('prefixes the label only when showLabel is true', () => {
    const withLabel = formatChangeLineHtml('値', '100円', '200円', true, 'new_only', escape);
    expect(withLabel).toBe('値: 200円');
    const withoutLabel = formatChangeLineHtml('値', '100円', '200円', false, 'new_only', escape);
    expect(withoutLabel).toBe('200円');
  });

  it('leaves list-mode Added/Removed output unstyled and joined with <br/>, unaffected by scalar highlighting', () => {
    const line = formatChangeLineHtml('項目', ['A'], ['B', 'A'], false, 'both', escape);
    expect(line).toBe('Added: B');
    expect(line).not.toContain('<strong');
    expect(line).not.toContain('<span');
  });

  it('keeps list-mode entries whole even when one of them was only lightly edited', () => {
    const line = formatChangeLineHtml('項目', ['A v1'], ['A v2'], false, 'both', escape);
    expect(line).toBe('Added: A v2<br/>Removed: A v1');
  });

  it('escapes each list item before joining, so no raw markup survives', () => {
    const line = formatChangeLineHtml('項目', ['A'], ['<b>x</b>', 'A'], false, 'both', escape);
    expect(line).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(line).not.toContain('<b>x</b>');
  });
});
