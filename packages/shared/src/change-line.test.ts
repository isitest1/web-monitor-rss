import { describe, expect, it } from 'vitest';
import { formatChangeLineHtml, formatScalarDiffHtml } from './change-line.js';

const escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');

describe('formatScalarDiffHtml', () => {
  it('wraps just the removed and added core in styled markup, leaving unchanged context plain', () => {
    const html = formatScalarDiffHtml('価格: 1,000円', '価格: 1,100円', escape);
    expect(html).toBe(
      '価格: 1,[<span style="color:#b91c1c;text-decoration:line-through;">0</span> → ' +
        '<strong style="color:#15803d;">1</strong>]00円',
    );
  });

  it('escapes markup characters found inside the diffed core', () => {
    const html = formatScalarDiffHtml('<script>', 'safe', escape);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong style="color:#15803d;">safe</strong>');
  });

  it('highlights a pure addition with only the added span present', () => {
    const html = formatScalarDiffHtml('Hello', 'Hello world', escape);
    expect(html).toBe('Hello[Added: <strong style="color:#15803d;"> world</strong>]');
  });

  it('highlights a pure deletion with only the removed span present', () => {
    const html = formatScalarDiffHtml('Hello world', 'Hello', escape);
    expect(html).toBe(
      'Hello[Removed: <span style="color:#b91c1c;text-decoration:line-through;"> world</span>]',
    );
  });

  it('returns the escaped value unchanged when nothing differs', () => {
    expect(formatScalarDiffHtml('same', 'same', escape)).toBe('same');
  });
});

describe('formatChangeLineHtml', () => {
  it("highlights a scalar Selection's changed core only in 'both' mode", () => {
    const line = formatChangeLineHtml('値', '100円', '200円', false, 'both', escape);
    expect(line).toContain('<strong style="color:#15803d;">2</strong>');
    expect(line).toContain('<span style="color:#b91c1c;text-decoration:line-through;">1</span>');
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

  it('escapes each list item before joining, so no raw markup survives', () => {
    const line = formatChangeLineHtml('項目', ['A'], ['<b>x</b>', 'A'], false, 'both', escape);
    expect(line).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(line).not.toContain('<b>x</b>');
  });
});
