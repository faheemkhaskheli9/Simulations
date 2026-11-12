// The offline World entrypoint must precache every static world-local import.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

test('offline precache covers the complete world module dependency graph', () => {
  const worker = readFileSync(resolve(ROOT, 'sw.js'), 'utf8');
  const block = worker.match(/const WORLD = \[([\s\S]*?)\];/);
  assert.ok(block, 'WORLD precache manifest exists');
  const cached = new Set([...block[1].matchAll(/'([^']+\.js)'/g)].map((match) => match[1]));
  assert.ok(cached.has('src/world/world.js'));
  for (const file of cached) {
    const source = readFileSync(resolve(ROOT, file), 'utf8');
    const imports = [...source.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+\.js)['"]/g)];
    for (const [, dependency] of imports) {
      if (!dependency.startsWith('.')) continue;
      const target = relative(ROOT, resolve(ROOT, dirname(file), dependency)).split(sep).join('/');
      if (target.startsWith('src/world/')) {
        assert.ok(cached.has(target), `${file} imports uncached world module ${target}`);
      }
    }
  }
});


test('offline precache includes game inspector and every OMNIVERSE-local static import', () => {
  const worker = readFileSync(resolve(ROOT, 'sw.js'), 'utf8');
  const block = worker.match(/const GAME = \[([\s\S]*?)\];/);
  assert.ok(block, 'GAME precache manifest exists');
  const cached = new Set([...block[1].matchAll(/'([^']+\.js)'/g)].map((match) => match[1]));
  assert.ok(cached.has('src/omniverse/ui/game-stage.js'));
  for (const file of cached) {
    const content = readFileSync(resolve(ROOT, file), 'utf8');
    for (const [, dependency] of content.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+\.js)['"]/g)) {
      if (!dependency.startsWith('.')) continue;
      const target = relative(ROOT, resolve(ROOT, dirname(file), dependency)).split(sep).join('/');
      if (target.startsWith('src/omniverse/')) assert.ok(cached.has(target), file + ' imports uncached ' + target);
    }
  }
});
