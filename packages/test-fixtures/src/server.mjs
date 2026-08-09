// Zero-dependency static file server for local Selector/Runner testing.
// Deliberately plain JavaScript: it is a dev-only fixture host, not part of
// the shipped product, so it is not worth a build step for ~30 lines.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const pagesDir = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'pages');
const port = Number(process.env.PORT ?? 4173);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/static.html';

  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(pagesDir, safePath);
  if (!filePath.startsWith(pagesDir)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }

  try {
    const body = await readFile(filePath);
    const type = CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

server.listen(port, () => {
  console.log(`test fixtures server listening on http://localhost:${port}`);
});
