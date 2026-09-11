import { diffArrayValues } from './diff-array.js';
import { diffScalarText } from './diff-scalar.js';
import type { ChangeDisplayMode } from './schemas/monitor.js';

/** Escapes one raw text fragment for the target markup (XML or HTML) — callers pass their own multiline-aware escaper (e.g. escapeXmlMultiline, escapeHtmlMultiline). */
export type EscapeFn = (text: string) => string;

function formatDisplayHtml(value: string | string[] | undefined, escape: EscapeFn): string {
  if (value === undefined) return '(none)';
  return escape(Array.isArray(value) ? value.join(', ') : value);
}

// Inline styles (not classes) because both call sites are standalone markup
// fragments — an RSS <description> read in a feed reader's own stylesheet
// context, and an admin page snippet — with no shared CSS to hook into.
const REMOVED_STYLE = 'color:#b91c1c;text-decoration:line-through;';
const ADDED_STYLE = 'color:#15803d;';

/**
 * Renders a scalar (single-value) Selection's change as the edited portion
 * in context, instead of the whole before/after text — trims the shared
 * prefix/suffix via diffScalarText, then wraps just the removed/added core
 * in inline-styled markup (strikethrough red for the old text, bold green
 * for the new) so the reader's eye lands on what actually changed instead
 * of having to spot it inside a full value. Every raw text fragment is
 * passed through `escape` individually, so the returned string is already
 * safe to embed — callers must not escape it again.
 */
export function formatScalarDiffHtml(oldValue: string, newValue: string, escape: EscapeFn): string {
  const diff = diffScalarText(oldValue, newValue);
  if (!diff.changed) return escape(newValue);
  const removedHtml = diff.removed
    ? `<span style="${REMOVED_STYLE}">${escape(diff.removed)}</span>`
    : '';
  const addedHtml = diff.added
    ? `<strong style="${ADDED_STYLE}">${escape(diff.added)}</strong>`
    : '';
  const core =
    diff.removed && diff.added
      ? `${removedHtml} → ${addedHtml}`
      : diff.added
        ? `Added: ${addedHtml}`
        : `Removed: ${removedHtml}`;
  return `${escape(diff.contextBefore)}[${core}]${escape(diff.contextAfter)}`;
}

/**
 * Builds one Selection's change line as ready-to-embed markup — safe to
 * insert directly, never to be escaped again, since every raw text fragment
 * has already gone through `escape`. Shared by the RSS description
 * (XML-escaped) and the admin history table (HTML-escaped) so the two
 * surfaces can't drift the way they did before (a past bug had one side
 * comma-joining list diffs while the other line-broke them).
 *
 * For a list-mode (array-valued) Selection, shows which entries were added/
 * removed instead of the whole before/after list; for a scalar Selection,
 * shows just the edited portion in context, highlighted (see
 * formatScalarDiffHtml) — both avoid dumping the whole before/after value
 * for a change that only touched a small part of it. In 'new_only' mode
 * (per-Monitor setting), the removed/old side is dropped entirely:
 * list-mode shows just the added items with no "Added:" prefix, and
 * scalar-mode shows just the new value with no highlighting (there is
 * nothing to diff against).
 */
export function formatChangeLineHtml(
  label: string,
  oldValue: string | string[] | undefined,
  newValue: string | string[] | undefined,
  showLabel: boolean,
  mode: ChangeDisplayMode,
  escape: EscapeFn,
): string {
  const labelHtml = escape(label);
  if (Array.isArray(newValue)) {
    const { added, removed } = diffArrayValues(
      Array.isArray(oldValue) ? oldValue : undefined,
      newValue,
    );
    const addedHtml = added.map((v) => escape(v));
    const removedHtml = removed.map((v) => escape(v));
    let diffHtml: string;
    if (mode === 'new_only') {
      diffHtml = addedHtml.length > 0 ? addedHtml.join('<br/>') : '(no new items)';
    } else {
      const parts: string[] = [];
      if (addedHtml.length > 0) parts.push(`Added: ${addedHtml.join('<br/>')}`);
      if (removedHtml.length > 0) parts.push(`Removed: ${removedHtml.join('<br/>')}`);
      diffHtml = parts.length > 0 ? parts.join('<br/>') : '(order changed)';
    }
    return showLabel ? `${labelHtml}: ${diffHtml}` : diffHtml;
  }
  const diffHtml =
    mode === 'new_only'
      ? formatDisplayHtml(newValue, escape)
      : typeof oldValue === 'string' && typeof newValue === 'string'
        ? formatScalarDiffHtml(oldValue, newValue, escape)
        : `${formatDisplayHtml(oldValue, escape)} → ${formatDisplayHtml(newValue, escape)}`;
  return showLabel ? `${labelHtml}: ${diffHtml}` : diffHtml;
}
