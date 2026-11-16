import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

async function unusedPort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  probe.close();
  await once(probe, 'close');
  return port;
}

test('static server rejects unsafe requests without disrupting public files', { timeout: 10000 }, async () => {
  const port = await unusedPort();
  const child = spawn(process.execPath, ['server.js', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server did not start: ${output}`)), 5000);
      child.stdout.on('data', (chunk) => {
        output += String(chunk);
        if (output.includes('Simulations running')) { clearTimeout(timer); resolve(); }
      });
      child.once('error', (err) => { clearTimeout(timer); reject(err); });
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited: ${code}`)); });
    });
    const base = `http://127.0.0.1:${port}`;
    for (const path of ['/%E0%A4%A', '/%ZZ', '/%00']) {
      assert.equal((await fetch(`${base}${path}`)).status, 400, path);
    }
    for (const path of ['/.gitignore', '/%2egitignore', '/.git/config', '/public%2f.gitignore']) {
      assert.equal((await fetch(`${base}${path}`)).status, 403, path);
    }
    const post = await fetch(`${base}/`, { method: 'POST' });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('allow'), 'GET, HEAD');
    const head = await fetch(`${base}/index.html`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal((await fetch(`${base}/does-not-exist-98765.txt`)).status, 404);
    const valid = await fetch(`${base}/index.html`);
    assert.equal(valid.status, 200, 'server stays alive');
    assert.match(valid.headers.get('content-type'), /^text\\/html/);
    assert.match(await valid.text(), /<html/i);
  } finally {
    child.kill();
  }
});
