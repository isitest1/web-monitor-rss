// A rounded badge with the classic RSS "broadcast" glyph, in the admin
// UI's own accent color. Reused as both the browser-tab favicon and the
// header logo so the two stay visually identical.
const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
  '<rect width="32" height="32" rx="8" fill="#3556d6"/>' +
  '<circle cx="9.5" cy="23" r="3" fill="#fff"/>' +
  '<path d="M7 15.5a8.5 8.5 0 0 1 8.5 8.5" stroke="#fff" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
  '<path d="M7 8a16 16 0 0 1 16 16" stroke="#fff" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
  '</svg>';

const FAVICON_HREF = `data:image/svg+xml;base64,${btoa(ICON_SVG)}`;

export interface LayoutOptions {
  fullWidth?: boolean;
}

export function layout(title: string, bodyHtml: string, options: LayoutOptions = {}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} - Web Monitor RSS</title>
<link rel="icon" type="image/svg+xml" href="${FAVICON_HREF}" />
<style>
  :root {
    --bg: #f4f5f7;
    --surface: #ffffff;
    --border: #e4e6eb;
    --text: #1a1d23;
    --muted: #6b7280;
    --accent: #3556d6;
    --accent-hover: #2a44ad;
    --ok: #1a7f37;
    --error: #c62828;
    --warn: #b35900;
    --radius: 12px;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Hiragino Sans", "Yu Gothic", system-ui, sans-serif;
    margin: 0;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
  }
  header {
    background: var(--text);
    color: #fff;
    padding: 1rem 2rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  header a { color: #fff; text-decoration: none; font-weight: 600; font-size: 1rem; letter-spacing: 0.01em; display: flex; align-items: center; gap: 0.5rem; }
  header .logo { width: 22px; height: 22px; border-radius: 6px; flex-shrink: 0; }
  main { max-width: ${options.fullWidth ? 'none' : '1180px'}; margin: 0 auto; padding: 2rem 2rem 4rem; }
  h1 { font-size: 1.4rem; margin: 0 0 0.25rem; }
  h2 { font-size: 1.1rem; margin: 0 0 0.75rem; }
  a { color: var(--accent); }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 0.65rem 0.85rem; border-bottom: 1px solid var(--border); text-align: left; font-size: 0.88rem; vertical-align: middle; }
  th { color: var(--muted); font-weight: 600; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; }
  tbody tr:hover { background: #fafbfc; }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.5rem;
    margin-bottom: 1.25rem;
    box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
    overflow-x: auto;
  }
  button, input[type="submit"] {
    background: var(--accent);
    color: #fff;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 500;
    transition: background 0.15s ease;
  }
  button:hover, input[type="submit"]:hover { background: var(--accent-hover); }
  button.secondary { background: transparent; color: var(--muted); border: 1px solid var(--border); }
  button.secondary:hover { background: var(--bg); color: var(--text); }
  button.link { background: none; border: none; color: var(--muted); padding: 0.15rem 0; font-size: 0.78rem; text-decoration: underline; }
  button.link:hover { color: var(--accent); background: none; }
  button.danger-link { background: none; border: none; color: var(--error); padding: 0.15rem 0; font-size: 0.78rem; text-decoration: underline; }
  button.danger-link:hover { background: none; opacity: 0.8; }
  input[type="text"], input[type="password"], input[type="url"], select {
    padding: 0.5rem 0.65rem; border: 1px solid var(--border); border-radius: 8px;
    width: 100%; box-sizing: border-box; font-size: 0.88rem; background: #fff; color: var(--text);
  }
  .rss-url { font-family: ui-monospace, monospace; font-size: 0.78rem; color: var(--muted); }
  .status-ok { color: var(--ok); font-weight: 700; font-size: 1rem; }
  .status-warn { color: var(--warn); font-weight: 700; font-size: 1rem; }
  .status-error { color: var(--error); font-weight: 700; font-size: 1rem; }
  .muted { color: var(--muted); font-size: 0.85rem; }
  .actions-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.75rem; }
  .alert-card { border-color: var(--error); background: #fff5f5; }
  /* Grouped-field cell layout (Watchlist): several related values stacked in
     one column instead of one column each, so a wide row of small facts
     reads as a compact block rather than a long strip of thin columns. */
  .table-align-top td { vertical-align: top; }
  .cell-stack { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.82rem; }
  .cell-stack.nowrap > * { white-space: nowrap; }
  .field-row { display: flex; align-items: center; gap: 0.4rem; }
  .field-row + .field-row { margin-top: 0.35rem; }
  .field-row select { width: auto; min-width: 108px; }
  .field-label { flex: 0 0 auto; display: inline-block; min-width: 2.6em; font-size: 0.72rem; color: var(--muted); }
  #watchlist-table th:nth-child(1), #watchlist-table td:nth-child(1) { width: 2rem; }
  #watchlist-table th:nth-child(2), #watchlist-table td:nth-child(2) { max-width: 150px; }
  #watchlist-table th:nth-child(3), #watchlist-table td:nth-child(3) { max-width: 160px; }
  .group-input { font-size: 0.75rem; padding: 0.25rem 0.4rem; color: var(--muted); }
  .bulk-actions-bar {
    display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
    background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
    padding: 0.6rem 0.85rem; margin-bottom: 0.75rem;
  }
  .bulk-group { display: flex; align-items: center; gap: 0.35rem; }
  .bulk-group select { width: auto; }
  .actions-grid { display: grid; grid-template-columns: repeat(2, minmax(88px, 1fr)); gap: 0.4rem 0.5rem; }
  .action-chip {
    display: inline-flex; align-items: center; justify-content: center; text-align: center;
    padding: 0.4rem 0.5rem; border: 1px solid var(--border); border-radius: 8px;
    font-size: 0.78rem; color: var(--text); text-decoration: none; background: #fff;
    cursor: pointer; white-space: nowrap;
  }
  .action-chip:hover { background: var(--bg); }
  .action-chip.danger { color: var(--error); border-color: #f3caca; }
  .action-chip.danger:hover { background: #fff5f5; }
  .action-chip.disabled { color: var(--muted); cursor: default; background: var(--bg); }
  .action-chip.disabled:hover { background: var(--bg); }
  /* Sortable Monitor headers/labels: clicking toggles ascending/descending
     order without adding extra visible controls. */
  .sort-trigger { cursor: pointer; user-select: none; }
  th.sort-trigger:hover { color: var(--text); }
  span.sort-trigger:hover { text-decoration: underline; }
  .sort-trigger.sort-active { color: var(--accent); font-weight: 600; }
  .sort-trigger.sort-active::after { content: '\\25B2'; font-size: 0.65em; margin-left: 0.2em; }
  .sort-trigger.sort-active.sort-desc::after { content: '\\25BC'; }
</style>
</head>
<body>
<header><a href="/monitors"><img class="logo" src="${FAVICON_HREF}" alt="" />Web Monitor RSS</a></header>
<main>
${bodyHtml}
</main>
</body>
</html>`;
}
