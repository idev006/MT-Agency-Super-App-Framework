#!/usr/bin/env node
// Kanban board document from the GitHub issues (owner 2026-11-28: "ผมเสนอให้ทำเอกสาร KANBAN BOARD ก็พอ", VC-ADR-056).
// The issues stay the one source (status labels, milestones); this script only draws them as columns, so the board never
// becomes a second copy to keep by hand. Run after an issue changes status (same docs PR):
//   node scripts/gen-kanban.mjs            write apps/vehicle-contact/docs/KANBAN_BOARD.md
// needs: gh (logged in). Not a CI check (CI has no issue access); the board shows when it was drawn.
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'apps/vehicle-contact/docs/KANBAN_BOARD.md');
const REPO = 'idev006/MT-Agency-Super-App-Framework';
const gh = args => JSON.parse(execFileSync('gh', args, {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024}));
const fields = 'number,title,labels,milestone,closedAt,updatedAt';
const open = gh(['issue', 'list', '--repo', REPO, '--state', 'open', '--limit', '200', '--json', fields]);
const closed = gh(['issue', 'list', '--repo', REPO, '--state', 'closed', '--limit', '12', '--json', fields]);

const labels = i => i.labels.map(l => l.name);
const has = (i, l) => labels(i).includes(l);
const prio = i => (labels(i).find(l => l.startsWith('priority:')) || 'priority:p9').slice(-1);
const tag = i => (i.title.match(/^\[([A-Za-z0-9-]+)\]/) || [, ''])[1];
const order = (a, b) => prio(a).localeCompare(prio(b)) || a.number - b.number;
const COLUMNS = [
  ['กำลังทำ (in progress)', i => has(i, 'status:in-progress')],
  ['รอ owner / ติดขัด (blocked, on hold, review)', i => ['status:blocked', 'status:on-hold', 'status:review'].some(l => has(i, l))],
  ['ถัดไป (todo)', () => true]
];
const placed = new Set(), cols = COLUMNS.map(([name, test]) => {
  const items = open.filter(i => !placed.has(i.number) && test(i)).sort(order);
  items.forEach(i => placed.add(i.number));
  return [name, items];
});
const row = i => `| ${tag(i) || '—'} | [#${i.number}](https://github.com/${REPO}/issues/${i.number}) ${i.title.replace(/^(\[[^\]]+\])+\s*/, '').replace(/\|/g, '/')} | ${i.milestone?.title || '—'} | ${prio(i) === '9' ? '—' : 'P' + prio(i)} |`;
const lines = [
  '# P6 Vehicle Contact — Kanban board',
  '',
  `**Drawn:** ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC from the GitHub issues by \`node scripts/gen-kanban.mjs\` — do not edit by hand.`,
  '**Source of truth:** the issues (labels `status:*`, `priority:*`, milestones). Order of work and done-criteria: [ROADMAP.md](ROADMAP.md). Current state: [CURRENT_DELIVERY_STATUS.md](CURRENT_DELIVERY_STATUS.md).',
  '',
  ...cols.flatMap(([name, items]) => [`## ${name} — ${items.length}`, '', '| Item | Issue | Milestone | Priority |', '|---|---|---|---|', ...(items.length ? items.map(row) : ['| — | (none) | | |']), '']),
  `## เสร็จล่าสุด (closed, newest ${closed.length})`, '', '| Item | Issue | Closed |', '|---|---|---|',
  ...closed.map(i => `| ${tag(i) || '—'} | [#${i.number}](https://github.com/${REPO}/issues/${i.number}) ${i.title.replace(/^(\[[^\]]+\])+\s*/, '').replace(/\|/g, '/')} | ${String(i.closedAt).slice(0, 10)} |`),
  ''
];
writeFileSync(out, lines.join('\n'));
console.log(`KANBAN: ${cols.map(([n, i]) => n.split(' ')[0] + ' ' + i.length).join(', ')}, closed ${closed.length} → ${path.relative(root, out)}`);
