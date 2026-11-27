#!/usr/bin/env node
// VC-ADR-051 N1a: the legacy acceptance tests (backend/gas/tests) are the specification of the backend. This script writes
// async copies of them into backend/core/tests/generated/, which run through the Node core harness
// (tests/support/core-harness.mjs: the core in front, everything it does not answer forwarded to the legacy engine). So the
// core is held to the same tests without hand-kept duplicates.
//   node scripts/gen-core-acceptance.mjs           write the copies
//   node scripts/gen-core-acceptance.mjs --check   fail if a copy is stale or missing (CI)
// The transform (acorn): every harness call h.call / h.as / h.stagePhotos / h.createCampaign / h.createOrganization becomes
// (await …); a function that now holds an await becomes async; calls to such local functions are awaited too (to a fixpoint).
// An await that would land inside a callback the test passes to something else (array.map, assert.throws …) is refused:
// that file is not listed until the test is written so the copy stays correct.
import {readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as acorn from 'acorn';

const here = dirname(fileURLToPath(import.meta.url));
const CORE = resolve(here, '..');
const LEGACY_TESTS = resolve(CORE, '../gas/tests');
const OUT = resolve(CORE, 'tests/generated');

// the legacy test files held against the core (grows with N1b–N3)
export const FILES = [
  'admin-vehicle-list.test.mjs',
  'print-filters.test.mjs',
  'settings-registry.test.mjs',
  'photo-policy.test.mjs',
  'log-policy.test.mjs',
  'system-reset.test.mjs'
];
const HARNESS_METHODS = new Set(['call', 'as', 'stagePhotos', 'createCampaign', 'createOrganization']);
const TEST_FUNCTIONS = new Set(['test', 'it', 'describe']);

function walk(node, visit, parent = null, key = null) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent, key);
  for (const k of Object.keys(node)) {
    if (k === 'type' || k === 'start' || k === 'end') continue;
    const v = node[k];
    if (Array.isArray(v)) for (const c of v) walk(c, visit, node, k);
    else if (v && typeof v.type === 'string') walk(v, visit, node, k);
  }
}
const isFunction = n => /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type);

export function transform(source, file = 'input') {
  const ast = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module'});
  const parents = new Map();
  walk(ast, (n, p) => parents.set(n, p));
  const enclosingFunction = n => { for (let p = parents.get(n); p; p = parents.get(p)) if (isFunction(p)) return p; return null; };
  // harness variables: names bound to createAcceptanceHarness(...), plus parameters named the same (helpers taking h)
  const harnessNames = new Set();
  walk(ast, n => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init?.type === 'CallExpression'
      && n.init.callee.type === 'Identifier' && n.init.callee.name === 'createAcceptanceHarness') harnessNames.add(n.id.name);
  });
  // local functions by name (declarations and const x = () => …). Names repeat across tests (each test has its own `list`);
  // a call is awaited when ANY function of that name is async — awaiting a plain value is harmless
  const localFns = new Map(), named = new Set();
  const addFn = (name, fn) => { if (!localFns.has(name)) localFns.set(name, new Set()); localFns.get(name).add(fn); named.add(fn); };
  walk(ast, n => {
    if (n.type === 'FunctionDeclaration' && n.id) addFn(n.id.name, n);
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && isFunction(n.init)) addFn(n.id.name, n.init);
  });
  const awaited = new Set(); // CallExpression nodes to wrap
  const asyncFns = new Set();
  const isHarnessCall = n => n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed
    && n.callee.object.type === 'Identifier' && harnessNames.has(n.callee.object.name) && HARNESS_METHODS.has(n.callee.property.name);
  const isAsyncLocalCall = n => n.type === 'CallExpression' && n.callee.type === 'Identifier'
    && [...(localFns.get(n.callee.name) || [])].some(fn => asyncFns.has(fn));
  for (let changed = true; changed;) {
    changed = false;
    walk(ast, n => {
      if (awaited.has(n) || !(isHarnessCall(n) || isAsyncLocalCall(n))) return;
      awaited.add(n); changed = true;
      const fn = enclosingFunction(n);
      if (fn && !asyncFns.has(fn)) asyncFns.add(fn);
    });
  }
  // every async function must be a test body or a named local function (whose calls are awaited); anything else would leak
  // a promise where the legacy test expected a value
  for (const fn of asyncFns) {
    if (named.has(fn)) continue;
    const p = parents.get(fn);
    const okTestBody = p?.type === 'CallExpression' && p.callee.type === 'Identifier' && TEST_FUNCTIONS.has(p.callee.name);
    if (!okTestBody) {
      const line = source.slice(0, fn.start).split('\n').length;
      throw Error(`${file}:${line}: a harness call inside a callback that is not a test body — cannot be made async safely`);
    }
  }
  const edits = [];
  for (const n of awaited) { edits.push([n.start, '(await '], [n.end, ')']); }
  for (const fn of asyncFns) if (!fn.async) {
    // the async keyword goes before `function` / the arrow's parameters; for a method-less declaration that is fn.start
    edits.push([fn.start, 'async ']);
  }
  // imports: the fixture becomes the core harness; ../src/… and ./other.mjs point back into the legacy tree
  walk(ast, n => {
    if (n.type !== 'ImportDeclaration' && !(n.type === 'ImportExpression')) return;
    const lit = n.source; if (lit?.type !== 'Literal') return;
    const spec = lit.value;
    let to = null;
    if (spec === './acceptance-fixture.mjs') to = '../support/core-harness.mjs';
    else if (spec.startsWith('../src/')) to = '../../../gas/src/' + spec.slice('../src/'.length);
    else if (spec.startsWith('./')) to = '../../../gas/tests/' + spec.slice(2);
    if (to) edits.push([lit.start, null, lit.end, JSON.stringify(to).replace(/"/g, "'")]);
  });
  edits.sort((a, b) => b[0] - a[0] || (a[1] === ')' ? -1 : 1));
  let out = source;
  for (const e of edits) out = e.length === 4 ? out.slice(0, e[0]) + e[3] + out.slice(e[2]) : out.slice(0, e[0]) + e[1] + out.slice(e[0]);
  return out;
}

const header = file => `// GENERATED by backend/core/scripts/gen-core-acceptance.mjs from backend/gas/tests/${file} — do not edit.\n`
  + '// The same acceptance test, run through the Node core (VC-ADR-051 N1a). Change the legacy test, then regenerate.\n';

function main() {
  const check = process.argv.includes('--check');
  const want = new Map(FILES.map(f => [f, header(f) + transform(readFileSync(join(LEGACY_TESTS, f), 'utf8'), f)]));
  const problems = [];
  if (!check) mkdirSync(OUT, {recursive: true});
  for (const [f, text] of want) {
    const target = join(OUT, f);
    if (check) { if (!existsSync(target) || readFileSync(target, 'utf8') !== text) problems.push('stale or missing: tests/generated/' + f); }
    else writeFileSync(target, text);
  }
  for (const f of existsSync(OUT) ? readdirSync(OUT) : []) if (!want.has(f)) {
    if (check) problems.push('not generated from a listed file: tests/generated/' + f); else rmSync(join(OUT, f));
  }
  if (problems.length) { console.error(problems.join('\n') + '\nRun: node scripts/gen-core-acceptance.mjs'); process.exit(1); }
  console.log(check ? `generated acceptance copies current (${want.size})` : `wrote ${want.size} generated acceptance copies`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
