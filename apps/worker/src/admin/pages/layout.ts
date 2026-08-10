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
<html lang="ja">
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
  .status-ok { color: var(--ok); font-weight: 600; }
  .status-warn { color: var(--warn); font-weight: 600; }
  .status-error { color: var(--error); font-weight: 600; }
  .muted { color: var(--muted); font-size: 0.85rem; }
  .actions-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.75rem; }
  .alert-card { border-color: var(--error); background: #fff5f5; }
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
