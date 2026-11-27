// The Dependency Rule (NODE_CORE_ARCHITECTURE §4 / §5): source dependencies point inwards; only the http-client calls fetch.
// Scans every file under backend/core/src; a wrong arrow fails CI.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve(import.meta.dirname, '../src');
const walk = d => fs.readdirSync(d, {withFileTypes: true}).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(src).filter(f => f.endsWith('.mjs') || f.endsWith('.js'));
const layerOf = f => { const r = path.relative(src, f).split(path.sep); return r.length === 1 ? 'root' : r[0]; };
const code = f => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const imports = f => [...code(f).matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
const target = (f, spec) => {
  if (spec.startsWith('node:')) return 'node';
  if (!spec.startsWith('.')) return 'package:' + spec;
  const abs = path.resolve(path.dirname(f), spec);
  if (abs.includes(`${path.sep}gas${path.sep}src${path.sep}domain${path.sep}`)) return 'domain'; // domain lives in gas/src until phase 9
  if (!abs.startsWith(src)) return 'outside-core';
  return layerOf(abs);
};
// layer -> what it may depend on (root = server.mjs / main.mjs = composition root: anything)
const ALLOWED = {
  domain: ['domain'],
  ports: [],
  application: ['domain', 'ports', 'application'],
  facade: ['application', 'domain', 'ports', 'facade', 'node', 'outside-core'], // outside-core: legacy api rules + shared flows until phase 9
  http: ['http', 'ports', 'application', 'facade', 'domain', 'outside-core'], // outside-core: the shared cloudrun handler
  adapters: ['adapters', 'ports', 'domain', 'node', 'outside-core', 'package:@google-cloud/firestore']
};

test('DEP-01 every import follows the Dependency Rule', () => {
  const wrong = [];
  for (const f of files) {
    const layer = layerOf(f);
    if (layer === 'root') continue;
    assert.ok(ALLOWED[layer], 'unknown layer folder: ' + layer + ' (' + path.relative(src, f) + ')');
    for (const spec of imports(f)) { const t = target(f, spec); if (!ALLOWED[layer].includes(t)) wrong.push(`${path.relative(src, f)} → ${spec} (${layer} may not use ${t})`); }
  }
  assert.deepEqual(wrong, []);
});

test('DEP-02 only adapters/outbound/http-client.mjs calls fetch', () => {
  const callers = files.filter(f => /\bfetch(Impl)?\s*\(/.test(code(f))).map(f => path.relative(src, f).split(path.sep).join('/'));
  assert.deepEqual(callers, ['adapters/outbound/http-client.mjs']);
});

test('DEP-03 the rule itself bites (a fake wrong import is caught)', () => {
  const fake = path.join(src, 'application', 'x.mjs');
  assert.equal(target(fake, '../adapters/outbound/http-client.mjs'), 'adapters');
  assert.equal(ALLOWED.application.includes('adapters'), false);
});
