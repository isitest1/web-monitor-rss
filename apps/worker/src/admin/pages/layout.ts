export function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} - Web Monitor RSS</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 0; background: #f7f7f8; color: #1a1a1a; }
  header { background: #1a1a1a; color: #fff; padding: 1rem 1.5rem; }
  header a { color: #fff; text-decoration: none; font-weight: bold; }
  main { max-width: 960px; margin: 0 auto; padding: 1.5rem; }
  table { width: 100%; border-collapse: collapse; background: #fff; }
  th, td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #e2e2e2; text-align: left; font-size: 0.9rem; }
  .card { background: #fff; border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
  button, input[type="submit"] { background: #1a1a1a; color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }
  button.secondary { background: #e2e2e2; color: #1a1a1a; }
  input[type="text"], input[type="password"], input[type="url"] { padding: 0.5rem; border: 1px solid #ccc; border-radius: 6px; width: 100%; box-sizing: border-box; }
  .status-ok { color: #1a7f37; }
  .status-warn { color: #b35900; }
  .status-error { color: #c62828; }
  .muted { color: #666; font-size: 0.85rem; }
</style>
</head>
<body>
<header><a href="/monitors">Web Monitor RSS 管理画面</a></header>
<main>
${bodyHtml}
</main>
</body>
</html>`;
}
