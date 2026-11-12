// Tiny dependency-free static file server: `node server.js [port]`.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 8080);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (pathname.includes('\\0')) throw new URIError('NUL in path');
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  const path = pathname.replace(/^[/\\\\]+/, '');
  const file = resolve(root, path.endsWith('/') || !path ? `${path}index.html` : path);
  const rel = relative(root, file);
  if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\\\') || isAbsolute(rel)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`Simulations running at http://localhost:${port}`));
