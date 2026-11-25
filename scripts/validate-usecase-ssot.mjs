#!/usr/bin/env node
// Documentation governance only: validates UC API coverage and Mermaid source/preview consistency.
// DOES NOT claim Graphical Mermaid rendering, source semantics, production or live GAS acceptance.
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const file=p=>resolve(root,p),txt=p=>readFileSync(file(p),'utf8');
const fails=[],assert=(ok,msg)=>{if(!ok)fails.push(msg);};
const app='apps/vehicle-contact/';
const index=app+'docs/use-cases/';
const catalog=JSON.parse(txt(index+'catalog.json'));
const inventory=JSON.parse(txt(app+'contracts/api-inventory.v1.json'));
const policy=JSON.parse(txt(app+'contracts/api-permissions.v1.json'));
const schema=JSON.parse(txt(app+'schema/database.schema.json'));
const ops=inventory.operations.map(o=>o.group+'.'+o.action);
const known=new Set(ops),seen=new Map(),ids=new Set();
assert(catalog.cases.length===20,'Sequence catalog must contain 20 use cases');
assert(ops.length===59,'Phase-1 API inventory unexpectedly changed from 59 operations (update agreed coverage mapping)'); // R7: +vehicles.photo; VC-ADR-036: +users.reactivate, +organizations.enable
assert(new Set(ops).size===ops.length,'Duplicate API inventory operation');
assert(policy.operations.length===ops.length,'Permission contract/inventory length drift');
assert(policy.operations.every(p=>known.has(p.operation)),'Unknown permission-contract operation');
assert(catalog.liveEvidence?.sessionProtectedOperations===50&&catalog.liveEvidence?.rbacChecks===250,'Live evidence must retain 50 protected operations / 250 RBAC checks');
const indexDoc=txt(index+'README.md'),matrix=txt(app+'docs/traceability-matrix.md');
function lintDiagram(source,id){
 const lines=source.trim().split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 assert(lines[0]==='sequenceDiagram',id+': missing sequenceDiagram declaration');
 assert(lines.some(l=>l.startsWith('actor ')),id+': missing actor');
 assert(lines.filter(l=>l.startsWith('participant ')).length>=2,id+': insufficient participants');
 assert(lines.some(l=>/[-.]+>>/.test(l)),id+': no message exchange');
 const stack=[];let hasAlternate=false;
 for(const [i,line] of lines.entries()){
  if(/^(alt|opt|loop|par|critical|break)\s/.test(line)){
   stack.push({kind:line.split(/\s+/)[0],line:i+1});hasAlternate=true;
  } else if(/^else(?:\s|$)/.test(line)){
   assert(stack.length>0&&['alt','par'].includes(stack.at(-1).kind),id+': else outside alt/par at '+(i+1));
  } else if(line==='end'){
   assert(stack.length>0,id+': stray end at '+(i+1));
   if(stack.length)stack.pop();
  }
 }
 assert(!stack.length,id+': unclosed Mermaid block(s) '+stack.map(x=>x.kind+'@'+x.line).join(','));
 assert(hasAlternate,id+': no alternate/loop/failure branch');
}
for(const uc of catalog.cases){
 const id=uc.id;
 assert(/^UC-[A-Z]+-\d{2}$/.test(id),id+': invalid UC ID');
 assert(!ids.has(id),id+': duplicate UC ID');ids.add(id);
 assert(Array.isArray(uc.ops)&&uc.ops.length,id+': API operations missing');
 assert(uc.actor&&uc.pre&&uc.success&&uc.failure,id+': actor/pre/success/failure incomplete');
 assert(uc.status==='LIVE_DEV_API_SCOPE_VERIFIED_UAT_AND_RELEASE_OPEN',id+': status must distinguish scoped live DEV API evidence from open UAT/release gates');
 assert(Array.isArray(uc.tables)&&uc.tables.every(t=>Object.prototype.hasOwnProperty.call(schema.tables,t)),id+': unknown physical table');
 assert(Array.isArray(uc.tests)&&uc.tests.length,id+': no Test Case IDs');
 const spec=index+id+'/specification.md',diagram=index+id+'/sequence.mmd';
 assert(existsSync(file(spec)),id+': missing specification.md');
 assert(existsSync(file(diagram)),id+': missing sequence.mmd');
 if(!existsSync(file(spec))||!existsSync(file(diagram)))continue;
 const text=txt(spec),source=txt(diagram).trim();
 lintDiagram(source,id);
 assert(text.includes('**Status:** LIVE_DEV_API_SCOPE_VERIFIED; BROWSER_UAT_AND_PRODUCTION_GATES_OPEN'),id+': spec/catalog evidence status drift');
 assert(text.includes('## 2. Preconditions')&&text.includes('## 3. Successful outcome')&&text.includes('## 4. Failure')&&text.includes('## 5. Persistence')&&text.includes('## 6. Acceptance')&&text.includes('## 7. Development'),id+': missing mandatory spec section');
 const match=text.match(/## 9\. GitHub Mermaid Preview\s*```mermaid\s*([\s\S]*?)\s*```/);
 assert(Boolean(match),id+': Mermaid rendered preview not embedded');
 if(match)assert(match[1].trim()===source,id+': spec Mermaid preview diverged from canonical .mmd');
 assert(indexDoc.includes(id+'/specification.md'),id+': missing Use Case index entry');
 assert(matrix.includes('use-cases/'+id+'/specification.md'),id+': missing traceability matrix entry');
 for(const op of uc.ops){
  assert(known.has(op),id+': unknown API operation '+op);
  if(!seen.has(op))seen.set(op,[]);
  seen.get(op).push(id);
  assert(text.includes('`'+op+'`'),id+': API operation not shown in spec '+op);
 }
 for(const p of [...uc.source,...uc.testSources]){
  assert(p.startsWith('backend/gas/')&&existsSync(file(app+p)),id+': missing source/test file '+p);
 }
}
for(const op of ops){
 const owners=seen.get(op)||[];
 assert(owners.length===1,op+': must have exactly one owning UC, found '+owners.join(','));
 assert(matrix.includes('`'+op+'`'),op+': missing traceability matrix row');
}
assert(seen.size===ops.length,'Unexpected API mapping count');
assert(!matrix.includes('PENDING_REAL_GAS'),'Traceability matrix retains blanket pre-live status');
assert(txt('blueprint/MASTER_WEB_APP_BLUEPRINT.md').includes('USE_CASE_SEQUENCE_STANDARD.md'),'Web Blueprint must link UML standard');
assert(txt('blueprint/MASTER_GAS_BACKEND_API_BLUEPRINT.md').includes('USE_CASE_SEQUENCE_STANDARD.md'),'GAS Blueprint must link UML standard');
for(const e of fails)console.error('FAIL: '+e);
console.log('Vehicle Use Case SSOT: '+(fails.length?'FAILED':'PASSED')+
  '; '+ids.size+' UC diagrams; '+seen.size+'/'+ops.length+' unique v1 operations; '+fails.length+' errors');
if(fails.length)process.exitCode=1;
