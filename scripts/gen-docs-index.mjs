import fs from 'node:fs';
import path from 'node:path';
import {execSync} from 'node:child_process';

const dir = 'apps/vehicle-contact/docs';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'DOCS_INDEX.md').sort();

function gitDate(f) {
  try { return execSync(`git log -1 --format=%ad --date=short -- "${dir}/${f}"`, {encoding:'utf8'}).trim() || '—'; }
  catch { return '—'; }
}
function cat(f) {
  const n = f.replace(/\.md$/,'');
  if (/^(CURRENT_DELIVERY_STATUS|PROJECT_HANDOVER|DECISION_LOG|HANDOFF_|AGILE_KANBAN|DOCS_INDEX)/.test(n)) return 'Navigation / current';
  if (/RUNBOOK/.test(n)) return 'Runbook';
  if (/(EVIDENCE|INCIDENT|REHEARSAL)/.test(n)) return 'Evidence';
  if (/(PROPOSAL|BRIEFING|DOSSIER)/.test(n)) return 'Proposal / decision input';
  if (/(STANDARD|PATTERNS|BLUEPRINT|ARCHITECTURE|CODE_MAP|SYSTEM_MAP|_SSOT|GOVERNANCE|CHARTER|SENIOR_|_ROLE)/.test(n)) return 'Standard / architecture';
  if (/(PLAN|ROADMAP|WORKPACKAGE|BACKLOG|KANBAN|RACI|WORKFLOW|_SOP)/.test(n)) return 'Plan / process';
  if (/(PRD|PRODUCT_REQUIREMENTS|APPROVED_REQUIREMENTS|REQUIREMENTS|TRACEABILITY|DATA_MODEL|ER_DIAGRAM|SCHEMA)/.test(n)) return 'Requirements / design';
  if (/(PDPA|SECURITY|LEGAL|CONSENT|PRIVACY|RETENTION|LAWFUL)/.test(n)) return 'Compliance';
  if (/(FRONTEND|BACKEND|TEST|API_|QUALITY|PERFORMANCE|_COST|UPSKILL|RESEARCH)/.test(n)) return 'Engineering reference';
  return 'Reference';
}
const rows = files.map(f => {
  const text = fs.readFileSync(path.join(dir, f), 'utf8');
  const lines = text.split(/\r?\n/);
  const title = (lines.find(l => l.startsWith('# ')) || '# ' + f).replace(/^#\s*/, '').trim();
  const dates = [...text.matchAll(/20\d{2}-\d{2}-\d{2}/g)].map(m => m[0]);
  const fnDate = (f.match(/20\d{2}-\d{2}-\d{2}/) || [])[0] || null;
  const declared = dates.length ? dates.sort().at(-1) : fnDate;
  const statusLine = lines.find(l => /^\*\*Status/.test(l) || /^Status:/.test(l) || /\*\*Status:\*\*/.test(l)) || '';
  const status = statusLine
    .replace(/^\*\*Status:?\*\*\s*/, '').replace(/^Status:\s*/, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[\[\]]/g, '').replace(/\]\(/g, ' ')
    .split(/[|·]/)[0].trim().slice(0, 90);
  const safeTitle = title
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[\[\]]/g, '')
    .replace(/\|/g, '/')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .slice(0, 110);
  return {f, title: safeTitle, category: cat(f), git: gitDate(f), declared, status, hasDate: !!declared};
});
rows.sort((a,b) => (b.git||'').localeCompare(a.git||'') || a.f.localeCompare(b.f));

const readFirst = [
  ['CURRENT_DELIVERY_STATUS.md','สถานะรันไทม์/หลักฐานปัจจุบัน — จุดกลับมาทำงาน (authority ลำดับ 2 ใน PROJECT_HANDOVER §2)'],
  ['SYSTEM_MAP.md','แผนที่ระบบปัจจุบัน (Mermaid จาก source): บริบท, deploy, backend/frontend map, workflows, states, data map, "จะแก้ X แตะไฟล์ไหน"'],
  ['PROJECT_HANDOVER.md','ลำดับความน่าเชื่อถือ, กฎความปลอดภัย, next actions, prompt มาตรฐาน (§1)'],
  ['HANDOFF_FIRESTORE_PHASE3_CONTINUATION_20261123.md','handoff ล่าสุด Phase 3 + acceptance review §10'],
  ['BACKEND_FIRESTORE_LIVE_CUTOVER_EVIDENCE_20261123.md','หลักฐาน cutover: suite 97/97 + dual-store audit §4.3 + rollback window §6.1'],
  ['FIRESTORE_CUTOVER_ROLLBACK_RUNBOOK.md','ขั้นตอน rollback/monitoring'],
  ['DECISION_LOG.md','VC-ADR ทั้งหมด (019/020/021/022 = Firestore/runtime/PDPA/rollback)'],
];
const missingReadFirst = readFirst.filter(([f]) => !fs.existsSync(path.join(dir,f)));

const out = [];
out.push('# P6 Vehicle Contact — Docs Index');
out.push('');
out.push('**Document ID:** P6VC-DOCS-INDEX-001 | **Generated:** 2026-11-23 (Asia/Bangkok)');
out.push('**Purpose:** จุดเดียวที่บอกว่าเอกสารไหนคือ "ความจริงปัจจุบัน", เอกสารไหนเป็นหลักฐาน ณ วันที่, และเล่มไหนถูกแทนที่แล้ว — ลดความเสี่ยงเอกสารเก่าขัดกับสถานะจริง (handoff acceptance review PR #143)');
out.push('');
out.push('**กติกาการใช้ (ตาม [PROJECT_HANDOVER](PROJECT_HANDOVER.md) §2):** ลำดับความน่าเชื่อถือ = โค้ดจริงบน `main` + owner decision → `CURRENT_DELIVERY_STATUS.md` → แผนงาน → ADR/ข้อกำหนด → เอกสารหลักฐานตามวันที่. เอกสารหลักฐาน **พิสูจน์เฉพาะวันที่/ขอบเขตที่ระบุ**; ตัวเลขปัจจุบันชนะตัวเลขเก่าเสมอ');
out.push('');
out.push('> ตารางด้านล่าง **สร้างอัตโนมัติ** จาก H1 ของแต่ละไฟล์ + วันที่ commit ล่าสุด (git) + วันที่ที่ประกาศในเนื้อหา. อย่าแก้ด้วยมือ — สร้างใหม่ด้วย `node scripts/gen-docs-index.mjs` (repo root)');
out.push('');
out.push('## 1. อ่านก่อน (current-state authority)');
out.push('');
out.push('| เอกสาร | ใช้ทำอะไร |');
out.push('|---|---|');
for (const [f, why] of readFirst) out.push(`| [${f}](${f}) | ${why} |`);
out.push('');
out.push('## 2. เอกสารทั้งหมด (' + rows.length + ' ไฟล์)');
out.push('');
out.push('| เอกสาร | หมวด | อัปเดต (git) | วันที่ในไฟล์ | สถานะ / หมายเหตุ |');
out.push('|---|---|---|---|---|');
for (const r of rows) {
  const dt = r.hasDate ? r.declared : '**⚠ ไม่ระบุ**';
  out.push(`| [${r.f}](${r.f}) — ${r.title} | ${r.category} | ${r.git} | ${dt} | ${r.status || ''} |`);
}
out.push('');
out.push('## 3. กติกาความสด (freshness rules)');
out.push('');
out.push('- ทุกเอกสารควรมี **วันที่** (Last verified / Date / snapshot date) — `⚠ ไม่ระบุ` ในตารางคือกลุ่มที่ต้องเติมเมื่อแก้ครั้งถัดไป');
out.push('- เอกสารที่ถูกแทนที่ให้ติดป้าย **SUPERSEDED BY …** ที่หัวไฟล์ ไม่ลบ (เก็บประวัติตาม §2.5)');
out.push('- ตัวเลขที่ขึ้นกับเวลา (เช่น 97/97, 2,464 docs, V52) ให้ quote พร้อมวันที่/แหล่ง; ตัวเลขปัจจุบันอยู่ใน `CURRENT_DELIVERY_STATUS.md` เท่านั้น');
out.push('- Prompt สำหรับ AI ถัดไปมี **ชุดเดียว** ที่ [PROJECT_HANDOVER](PROJECT_HANDOVER.md) §1; handoff doc อ้างอิง ไม่ทำสำเนา');
out.push('');
if (missingReadFirst.length) console.log('WARN missing readFirst:', missingReadFirst);
fs.writeFileSync(path.join(dir, 'DOCS_INDEX.md'), out.join('\n'));
console.log('DOCS_INDEX.md written:', rows.length, 'docs');
const noDate = rows.filter(r=>!r.hasDate).map(r=>r.f);
console.log('no-date docs:', noDate.length, noDate.join(','));
