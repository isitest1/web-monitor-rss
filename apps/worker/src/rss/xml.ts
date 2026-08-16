export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Escapes for XML, then turns preserved line breaks (from
 * normalizeDisplay'd Selection values, or the description's own
 * per-Selection join) into <br/> tags — most feed readers render
 * <description> as HTML, so a raw newline character alone gets collapsed
 * to nothing visible and the content reads as one run-on line.
 */
export function escapeXmlMultiline(value: string): string {
  return escapeXml(value).replace(/\n/g, '<br/>');
}

/**
 * Wraps HTML in a CDATA section so RSS readers get real markup instead of
 * entity references — the `<description>`/`<content:encoded>` convention
 * most feed readers expect. `]]>` can't appear inside CDATA, so any
 * occurrence is split across adjacent CDATA sections, which XML parsers
 * concatenate back into one text node.
 */
export function wrapCData(html: string): string {
  return `<![CDATA[${html.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

export function toRfc822(iso: string): string {
  return new Date(iso).toUTCString().replace('GMT', '+0000');
}
