import { diffArrayValues } from './diff-array.js';
import { diffScalarText } from './diff-scalar.js';
import { diffDisplayText, type TextDiffRow, type TokenPart } from './diff-text.js';
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
const ELISION_STYLE = 'color:#6b7280;';

function removedHtml(text: string, escape: EscapeFn): string {
  return `<span style="${REMOVED_STYLE}">${escape(text)}</span>`;
}

function addedHtml(text: string, escape: EscapeFn): string {
  return `<strong style="${ADDED_STYLE}">${escape(text)}</strong>`;
}

function tokenPartHtml(part: TokenPart, escape: EscapeFn): string {
  if (part.type === 'removed') return removedHtml(part.text, escape);
  if (part.type === 'added') return addedHtml(part.text, escape);
  return escape(part.text);
}

function rowHtml(row: TextDiffRow, escape: EscapeFn): string {
  switch (row.type) {
    case 'context':
      return escape(row.text);
    case 'elision':
      return `<span style="${ELISION_STYLE}">… (${row.count} unchanged line${row.count === 1 ? '' : 's'})</span>`;
    case 'removed':
      return removedHtml(row.text, escape);
    case 'added':
      return addedHtml(row.text, escape);
    case 'modified':
      return row.parts.map((part) => tokenPartHtml(part, escape)).join('');
  }
}

/**
 * Last-resort rendering for a value too large to diff line by line within
 * the Worker's CPU budget: trims the shared prefix/suffix and shows the one
 * contiguous changed region in context. Coarse — a change touching two
 * distant spots swallows everything between them — which is exactly why it
 * is only the fallback.
 */
function formatCoarseScalarDiffHtml(oldValue: string, newValue: string, escape: EscapeFn): string {
  const diff = diffScalarText(oldValue, newValue);
  if (!diff.changed) return escape(newValue);
  const removed = diff.removed ? removedHtml(diff.removed, escape) : '';
  const added = diff.added ? addedHtml(diff.added, escape) : '';
  const core =
    diff.removed && diff.added
      ? `${removed} → ${added}`
      : diff.added
        ? `Added: ${added}`
        : `Removed: ${removed}`;
  return `${escape(diff.contextBefore)}[${core}]${escape(diff.contextAfter)}`;
}

/**
 * Renders a scalar (single-value) Selection's change as just the edited
 * regions in context, instead of the whole before/after text.
 *
 * The value is diffed line by line, so only genuinely changed lines are
 * shown; unchanged lines more than a few rows away from any edit are
 * replaced by a "… (N unchanged lines)" marker. Where a removed line and an
 * added line clearly correspond, the two are merged into one line whose
 * changed words alone are highlighted (strikethrough red for what went,
 * bold green for what arrived), so a one-word edit reads as one word rather
 * than as a whole replaced paragraph.
 *
 * Every raw text fragment is passed through `escape` individually, so the
 * returned string is already safe to embed — callers must not escape it
 * again.
 */
export function formatScalarDiffHtml(oldValue: string, newValue: string, escape: EscapeFn): string {
  const diff = diffDisplayText(oldValue, newValue);
  if (diff.overBudget) return formatCoarseScalarDiffHtml(oldValue, newValue, escape);
  if (!diff.changed) return escape(newValue);
  return diff.rows.map((row) => rowHtml(row, escape)).join('<br/>');
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
 * shows just the edited lines in context, highlighted down to the word (see
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
    const addedItems = added.map((v) => escape(v));
    const removedItems = removed.map((v) => escape(v));
    let diffHtml: string;
    if (mode === 'new_only') {
      diffHtml = addedItems.length > 0 ? addedItems.join('<br/>') : '(no new items)';
    } else {
      const parts: string[] = [];
      if (addedItems.length > 0) parts.push(`Added: ${addedItems.join('<br/>')}`);
      if (removedItems.length > 0) parts.push(`Removed: ${removedItems.join('<br/>')}`);
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
