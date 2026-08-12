export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escapes for HTML, then turns preserved line breaks (from
 * normalizeDisplay'd Selection values) into <br/> tags so multi-line
 * source content (e.g. list items) doesn't collapse into one run-on line
 * in a table cell.
 */
export function escapeHtmlMultiline(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br/>');
}

/** Safely embeds a string inside a single-quoted JS string literal in inline <script> HTML. */
export function escapeJs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/</g, '\\u003C')
    .replace(/\r?\n/g, '\\n');
}
