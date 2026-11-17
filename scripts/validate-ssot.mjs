#!/usr/bin/env node
// Read-only repository structure and canonical-source checks. No dependencies.
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {resolve, dirname, join, relative} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const failures=[]; const warnings=[];
const check=(ok,msg)=>{if(!ok)failures.push(msg)};
const file=p=>resolve(root,p);
const has=p=>existsSync(file(p));
const read=p=>readFileSync(file(p),'utf8');
const canonical='apps/vehicle-contact/poc/qr-scanner/index.html';
const docs='apps/vehicle-contact/docs';
const required=[
 'README.md','blueprint/MASTER_WEB_APP_BLUEPRINT.md',
 'blueprint/platform/MASTER_BLUEPRINT.md','blueprint/standards/APPLICATION_STRUCTURE.md',
 'blueprint/decisions/ADR-002-SSOT-BOUNDARIES.md',
 'apps/vehicle-contact/README.md',canonical,
 docs+'/PRODUCT_REQUIREMENTS.md',docs+'/POC_QR_SCANNER.md',
 docs+'/REQUIREMENTS_TRACEABILITY.md',docs+'/DECISION_LOG.md',
 'portal/apps.json','portal/index.template.html','scripts/build-pages.mjs'
];
for(const p of required)check(has(p),'Missing canonical file: '+p);
check(!has('docs/qr-scanner-poc'),'Legacy QR source exists in docs/qr-scanner-poc');
check(!has('_site'),'Generated _site must not be committed/present in checkout before build');
check(!has('apps/vehicle-contact/docs/qr-scanner-poc'),'Scanner must live in poc/, not docs/');
if(has(canonical))check(read(canonical).includes('Html5Qrcode'),'QR scanner canonical source missing decoder initialization');
if(has('portal/apps.json')){
 try{
  const registry=JSON.parse(read('portal/apps.json'));
  check(registry.schema_version===1&&Array.isArray(registry.apps),'Invalid app registry schema');
  const ids=new Set();
  for(const app of registry.apps||[]){
   check(!ids.has(app.id),'Duplicate app id: '+app.id);ids.add(app.id);
   check(app.source&&has(app.source),'App source missing: '+app.source);
   check(app.path==='./'+app.source.replace(/index\.html$/,'')||app.kind!=='poc','POC link differs from source path: '+app.id);
  }
 }catch(e){failures.push('Invalid portal/apps.json: '+e.message)}
}
function walk(dir,files=[]){
 if(!existsSync(dir))return files;
 for(const ent of readdirSync(dir,{withFileTypes:true})){
  if(['.git','node_modules','_site'].includes(ent.name))continue;
  const p=join(dir,ent.name);
  if(ent.isDirectory())walk(p,files);
  else if(ent.isFile()&&p.endsWith('.md'))files.push(p);
 }
 return files;
}
// Check local Markdown links, including compatibility pointers.
for(const p of walk(root)){
 const txt=readFileSync(p,'utf8');
 const re=/\[[^\]]*\]\(([^)]+)\)/g;
 for(const m of txt.matchAll(re)){
  let dest=m[1].trim().split(/\s+["']/)[0];
  if(!dest||/^(https?:|mailto:|tel:|#|data:)/i.test(dest)||dest.includes('<'))continue;
  dest=dest.split('#')[0].split('?')[0];
  if(!dest)continue;
  try{dest=decodeURIComponent(dest)}catch{}
  if(!existsSync(resolve(dirname(p),dest))){
   warnings.push('Broken local link: '+relative(root,p)+' -> '+m[1]);
  }
 }
}
if(process.argv[2]==='--built'){
 const out=resolve(root,process.argv[3]||'_site');
 const built=join(out,canonical);
 check(existsSync(built),'Missing generated QR scanner');
 if(existsSync(built)&&has(canonical))check(readFileSync(built,'utf8')===read(canonical),'Published scanner differs from canonical source');
 check(existsSync(join(out,'index.html')),'Missing generated app directory');
 check(existsSync(join(out,'qr-scanner-poc/index.html')),'Missing legacy URL redirect in generated artifact');
}
for(const m of warnings)console.warn('WARN '+m);
for(const m of failures)console.error('FAIL '+m);
console.log('SSOT validation: '+(failures.length?'FAILED':'PASSED')+'; '+failures.length+' errors, '+warnings.length+' link warnings');
if(failures.length)process.exitCode=1;
