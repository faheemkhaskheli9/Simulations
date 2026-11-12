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

test('invalid URL encoding returns HTTP 400 without crashing the server', { timeout: 10000 }, async () => {
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
    const invalid = await fetch(`http://127.0.0.1:${port}/%E0%A4%A`);
    assert.equal(invalid.status, 400);
    const valid = await fetch(`http://127.0.0.1:${port}/index.html`);
    assert.equal(valid.status, 200, 'server stays alive');
    assert.match(await valid.text(), /<html/i);
  } finally {
    child.kill();
  }
});
