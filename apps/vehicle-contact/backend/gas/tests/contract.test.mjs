import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createApiRouter} from '../src/api/routes/Router.js';
const router=createApiRouter(), call=(group,action,apiVersion='v1')=>router.dispatch({apiVersion,group,action,payload:{}},'POST');
assert.equal(call('system','health').ok,true);
assert.equal(call('vehicles','lookup').ok,false);
assert.equal(call('system','health','v2').ok,false);
assert.equal(call('__proto__','foo').ok,false);
assert.equal(router.dispatch({apiVersion:'v1',group:'system',action:'health',payload:'bad'},'POST').ok,false);
const health=router.dispatch({apiVersion:'v1',group:'system',action:'health',payload:{role:'admin'}},'POST').data;
assert.equal(health.status,'ready');
assert.equal(health.apiVersion,'v1');
assert.match(health.backendVersion,/^\d+\.\d+\.\d+$/);
assert.equal(health.releaseChannel,'development');
const pkgVersion=JSON.parse(readFileSync(resolve(import.meta.dirname,'../package.json'),'utf8')).version;
assert.equal(health.backendVersion,pkgVersion,'system.health backendVersion must equal package.json version so a published deployment is verifiable by probe');
const root=resolve(import.meta.dirname,'..');
const {readdirSync}=await import('node:fs');
const gasFiles=readdirSync(join(root,'dist')).filter(f=>f.endsWith('.gs')).sort();
const {relative}=await import('node:path');
function walkSources(dir){
 return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
  const full=join(dir,entry.name);
  return entry.isDirectory()?walkSources(full):entry.isFile()&&entry.name.endsWith('.js')?[full]:[];
 });
}
const expected=[...walkSources(join(root,'src')).map(file=>{
 const parts=relative(join(root,'src'),file).split(/[\\/]/);
 return parts[0].toUpperCase()+'$'+parts.slice(1).join('$').replace(/\.js$/,'.gs');
}),'SCHEMA$database.schema.gs'].sort();
assert.deepEqual(gasFiles,expected);
const mockContent={MimeType:{JSON:'JSON'},createTextOutput(v){return {value:v,setMimeType(){return this;}};}};
function loadGAS(order) {
 const context=vm.createContext({ContentService:mockContent,console});
 for(const file of order){
   const code=readFileSync(join(root,'dist',file),'utf8');
   assert.ok(code.split(/\r?\n/).length<=800, 'Exceeded 800 lines: '+file);
   assert.ok(!/^\\s*(import|export)\\s/m.test(code), 'Raw ESM remains: '+file);
   new vm.Script(code,{filename:file}).runInContext(context);
 }
 return context;
}
// GAS file ordering is implementation detail, not an architectural dependency.
for(const order of [gasFiles,[...gasFiles].reverse()]){
 const context=loadGAS(order);
 for(const name of ['doGet','doPost','previewVehicleReferenceSeedFromEditor','applyVehicleReferenceSeedFromEditor','recoverVehicleReferenceSeedFromEditor','bootstrapVehicleAdminFromEditor','benchmarkVehiclePasswordHashFromEditor','inspectVehicleAdminResetFromEditor','resetVehicleAdminPasswordFromEditor','pocFirestoreRestFromEditor','pocFirestoreCrudFromEditor','inspectVehicleConfigFromEditor'])
   assert.equal(typeof context[name],'function',name);
 // S1: no Google Sheets editor tool survives in the bundle.
 for(const gone of ['verifyVehicleSchemaFromEditor','migrateVehicleSchemaFromEditor','applyVehicleSchemaFromEditor','runVehicleStagingAuthTestsFromEditor','resetDevDataFromEditor','repairVehicleDisplayErrorsFromEditor','normalizeVehicleNumberFormatsFromEditor'])
   assert.equal(typeof context[gone],'undefined',gone);
 assert.equal(JSON.parse(context.doGet({}).value).data.status,'ready');
 assert.equal(JSON.parse(context.doPost({postData:{contents:'not JSON'}}).value).ok,false);
 const denied=JSON.parse(context.doPost({postData:{contents:JSON.stringify({apiVersion:'v1',group:'vehicles',action:'lookup',payload:{role:'admin'}})}}).value);
 assert.equal(denied.ok,false);
}
const bundle=gasFiles.map(f=>readFileSync(join(root,'dist',f),'utf8')).join('\n');
assert.equal(/SpreadsheetApp/.test(bundle),false,'S1: the GAS bundle must not reference SpreadsheetApp');
console.log('Layer-mirrored GAS source modules, order independence, safe API, editor entrypoints and no-Sheets bundle PASSED');
