// Short test output (owner 2026-11-26: save tokens — "npm run check" prints thousands of lines). Runs a command, keeps the
// full output in a log file, and prints only: the totals, each failing test with its first error lines, and the exit code.
//   node scripts/test-summary.mjs <label> -- <command…>
// Works with node --test, plain assertion scripts, vitest and Playwright output. Exit code = the command's exit code.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;
const STACK = /^\s*at\s|node:internal|^\s*\^+\s*$|^\s*$/;

export function summarize(raw, code) {
  const lines = raw.replace(ANSI, '').replace(/\r/g, '').split('\n');
  const sum = {pass: 0, fail: 0, skip: 0, flaky: 0};
  for (const l of lines) {
    let m;
    if ((m = l.match(/^ℹ (pass|fail|skipped) (\d+)/))) sum[m[1] === 'skipped' ? 'skip' : m[1]] += Number(m[2]);
    else if ((m = l.match(/^\s+Tests\s+(.*)$/))) for (const [, n, k] of m[1].matchAll(/(\d+) (passed|failed|skipped)/g)) sum[{passed: 'pass', failed: 'fail', skipped: 'skip'}[k]] += Number(n);
    else if ((m = l.match(/^\s+(\d+) (passed|failed|skipped|flaky)\b/)) && !/Tests|Test Files/.test(l)) sum[{passed: 'pass', failed: 'fail', skipped: 'skip', flaky: 'flaky'}[m[2]]] += Number(m[1]);
  }
  // failing tests: node --test "✖ name", vitest "FAIL file > name", Playwright "  1) [desktop] › file › name"
  const isFail = l => /^\s*✖ (?!failing tests)/.test(l) || /^\s*(×|FAIL)\s/.test(l) || /^\s+\d+\) \[/.test(l);
  // one entry per test (a runner prints a failure twice: in the run and in its summary) — keep the one with an error
  const NOISE = /^\s*(ℹ|⎯|Test Files|Tests\s|Duration|Start at|✔)/;
  const key = l => l.trim().replace(/^(✖|×|FAIL)\s+/, '').replace(/^\d+\)\s+/, '').replace(/\s*\(?\d+(\.\d+)?m?s\)?$/, '').split(/\s+[>›]\s+/).pop();
  const found = new Map();
  lines.forEach((l, i) => {
    if (!isFail(l)) return;
    const block = [];
    for (const x of lines.slice(i + 1, i + 40)) { if (/^\s*✖/.test(x) || isFail(x)) break; block.push(x); } // up to the next failure
    const detail = block.filter(x => !STACK.test(x) && !NOISE.test(x) && !/^test at /.test(x)).slice(0, 6).map(x => '    ' + x.trim().slice(0, 220));
    const k = key(l), prev = found.get(k), useful = detail.filter(x => /Error|Expected|expected|assert|Received|❯|>/.test(x)).length;
    if (!prev || useful > prev.useful) found.set(k, {text: ['  ' + l.trim().replace(/\s*\(\d+(\.\d+)?m?s\)$/, '').slice(0, 220), ...detail].join('\n'), useful});
  });
  const failures = [...found.values()].map(x => x.text);
  // a plain assertion script that crashed has no test markers: show its error
  const crash = code !== 0 && !failures.length ? lines.filter(l => /Error|assert|FAIL|failed/i.test(l) && !STACK.test(l)).slice(-8).map(l => '  ' + l.trim().slice(0, 220)) : [];
  return {sum, failures, crash};
}

const sep = process.argv.indexOf('--');
if (process.argv[1] && process.argv[1].endsWith('test-summary.mjs')) {
  if (sep < 0 || sep === process.argv.length - 1) { console.log('usage: node scripts/test-summary.mjs <label> -- <command…>'); process.exit(2); }
  const label = process.argv.slice(2, sep).join(' ') || 'tests', cmd = process.argv.slice(sep + 1).join(' ');
  const logDir = path.resolve('test-results'), log = path.join(logDir, `last-${label.replace(/[^a-z0-9]+/gi, '-')}.log`);
  const started = Date.now(), child = spawn(cmd, {shell: true, env: {...process.env, FORCE_COLOR: '0'}});
  let out = '';
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  child.on('close', code => {
    fs.mkdirSync(logDir, {recursive: true}); fs.writeFileSync(log, out);
    const {sum, failures, crash} = summarize(out, code);
    const secs = Math.round((Date.now() - started) / 1000);
    console.log(`${code === 0 ? 'PASS' : 'FAIL'} ${label}: passed ${sum.pass} · failed ${sum.fail}${sum.skip ? ' · skipped ' + sum.skip : ''}${sum.flaky ? ' · flaky ' + sum.flaky : ''} · exit ${code} · ${secs}s`);
    if (failures.length) console.log('failing:\n' + failures.slice(0, 15).join('\n') + (failures.length > 15 ? `\n  … ${failures.length - 15} more` : ''));
    if (crash.length) console.log('error:\n' + crash.join('\n'));
    console.log('full log: ' + path.relative(process.cwd(), log).split(path.sep).join('/'));
    process.exitCode = code ?? 1;
  });
}
