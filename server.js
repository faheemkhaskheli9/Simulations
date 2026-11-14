// Tiny dependency-free static file server: `node server.js [port]`.
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.argv[2] || process.env.PORT || 8080);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

function withinRoot(file) {
  const rel = relative(root, file);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (pathname.includes(String.fromCharCode(0))) throw new URIError('NUL in path');
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  const path = pathname.replace(/^[/\\]+/, '');
  // Never expose dotfiles (.env, .git) or their descendants through the dev server.
  if (path.split(/[\\/]/).some(segment => segment.startsWith('.'))) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  const file = resolve(root, path.endsWith('/') || !path ? `${path}index.html` : path);
  if (!withinRoot(file)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    // Resolve symlinks as well as `..` so links inside the project cannot serve
    // files from outside the project root.
    const actual = await realpath(file);
    if (!withinRoot(actual)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const body = await readFile(actual);
    res.writeHead(200, { 'content-type': types[extname(actual)] ?? 'application/octet-stream' })
      .end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`Simulations running at http://localhost:${port}`));
