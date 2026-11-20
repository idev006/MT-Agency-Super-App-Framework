import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import vm from 'node:vm';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {SANDBOX_ID,SANDBOX_PASSWORD,SANDBOX_QR_TOKEN,SANDBOX_HASHES} from './fixtures/staging-credentials.mjs';

const root=resolve(import.meta.dirname,'..');
const schema=JSON.parse(readFileSync(resolve(root,'../../schema/database.schema.json'),'utf8'));
const stamp=new Date().toISOString();
const signed=bytes=>Array.from(bytes,x=>x>127?x-256:x);

function makeFakeGAS() {
 const data=new Map(Object.entries(schema.tables).map(([t,s])=>[t,[s.columns.map(c=>c.name)]]));
 const names=[...data.keys()],metrics={opens:0,flushes:0,reads:0,writes:0,uploads:0,deletions:0};
 const fields=t=>schema.tables[t].columns.map(x=>x.name);
 const normalized=v=>typeof v==='string'&&v[0]==="'"?v.slice(1):v;
 const insert=(t,r)=>data.get(t).push(fields(t).map(k=>r[k]??''));
 const isBlank=row=>row.every(x=>x===''||x===null);
 const accounts=['SYSTEM_ADMIN','REGISTRATION_ADMIN','STAFF','OWNER','RETENTION_WORKER','STAFF'];
 for(let i=0;i<SANDBOX_HASHES.length;i++){
  const [name,salt,hash]=SANDBOX_HASHES[i];
  insert('vc_users',{
   user_id:'u-sandbox-'+(i+1),username_normalized:name,display_name:'Synthetic '+name,
   password_hash:'pbkdf2-sha256$150000$'+salt+'$'+hash,password_salt:'',
   password_change_required:name==='test_firstlogin',status:'ACTIVE',org_id:'org-test-police',
   created_at:stamp,updated_at:stamp
  });
  insert('vc_user_roles',{assignment_id:'role-sandbox-'+(i+1),user_id:'u-sandbox-'+(i+1),role_id:accounts[i],status:'ACTIVE'});
 }
 insert('vc_settings',{key:'idle_timeout_minutes',value:'30',updated_at:stamp,updated_by:'fixture'});
 insert('vc_settings',{key:'retention_days',value:'1',updated_at:stamp,updated_by:'fixture'});
 insert('vc_organizations',{organization_id:'org-test-police',name:'Synthetic Police Unit',org_type:'POLICE',parent_id:'',status:'ACTIVE',created_at:stamp,updated_at:stamp});
 insert('vc_organizations',{organization_id:'org-test-external',name:'Synthetic External Organization',org_type:'EXTERNAL',parent_id:'',status:'ACTIVE',created_at:stamp,updated_at:stamp});
 insert('vc_vehicles',{vehicle_id:'vehicle-sandbox-001',plate_normalized:'กข1234',province_code:'TH-10',
   plate_type:'PRIVATE',vehicle_type:'SEDAN',make:'SYNTHETIC_MAKE',model:'SYNTHETIC_MODEL',color:'BLUE',
   organization_id:'org-test-police',owner_user_id:'u-sandbox-4',status:'ACTIVE',version:1,
   created_by:'synthetic-test',updated_by:'synthetic-test',created_at:stamp,updated_at:stamp});
 insert('vc_vehicle_contacts',{contact_id:'contact-sandbox-001',vehicle_id:'vehicle-sandbox-001',
   display_name:'Synthetic Contact',phone_e164:'+66810000001',relationship:'REGISTERED_CONTACT',
   is_primary:true,status:'ACTIVE',verified_at:stamp,created_at:stamp,updated_at:stamp});
 for(const [i,slot]of ['FRONT','REAR','LEFT','RIGHT','FRONT_ANGLE'].entries())
  insert('vc_vehicle_photos',{photo_id:'photo-sandbox-'+(i+1),vehicle_id:'vehicle-sandbox-001',
   slot,storage_ref:'NONEXISTENT_SYNTHETIC_FILE_'+slot,mime_type:'image/png',size_bytes:69,
   status:'ACTIVE',version:1,created_at:stamp});
 insert('vc_qr_tokens',{qr_id:'qr-sandbox-001',vehicle_id:'vehicle-sandbox-001',
  token_digest:createHash('sha256').update(SANDBOX_QR_TOKEN).digest('hex'),
  issued_at:stamp,revoked_at:'',issued_by:'synthetic-test',reason:'ACCEPTANCE_FIXTURE',status:'ACTIVE'});
 function fakeSheet(t){
  const rows=data.get(t);
  return {
   getName(){return t;},getLastRow(){return rows.length;},getLastColumn(){return rows[0].length;},
   getRange(r,c,height,width){
    assert.ok(r>0&&c>0&&height>=1&&width>=1);
    assert.ok(c+width-1<=rows[0].length,'range width outside canonical schema '+t);
    const get=()=>{metrics.reads++;return Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>rows[r+i-1]?.[c+j-1]??''));};
    return {
     getValues(){return get();},
     getDisplayValues(){return get().map(row=>row.map(v=>typeof v==='boolean'?(v?'TRUE':'FALSE'):String(v)));},
     setValues(next){
      assert.equal(next.length,height);
      next.forEach((line,i)=>{assert.equal(line.length,width);while(rows.length<r+i)rows.push(Array(rows[0].length).fill(''));line.forEach((v,j)=>rows[r+i-1][c+j-1]=normalized(v));});
      metrics.writes++;
     }
    };
   },
   appendRow(row){assert.equal(row.length,rows[0].length);rows.push(row.map(normalized));metrics.writes++;},
   deleteRow(r){rows.splice(r-1,1);metrics.writes++;}
  };
 }
 const sheetMap=new Map(names.map(t=>[t,fakeSheet(t)]));
 const book={
  getName:()=> 'P6VC — Backend Acceptance Test Sandbox (Synthetic Only) — 2026-11-17',
  getSheets:()=>[...sheetMap.values()],
  getSheetByName:t=>sheetMap.get(t)||null
 };
 const spreadsheetApp={openById(id){metrics.opens++;assert.equal(id,SANDBOX_ID);return book;},flush(){metrics.flushes++;}};
 const lockService={getScriptLock(){return{tryLock(){return true;},releaseLock(){}}}};
 const utilities={
  newBlob(value,mime,name){
   const b=typeof value==='string'?Buffer.from(value,'utf8'):Buffer.from(value.map(x=>x&255));
   return {getBytes(){return signed(b);},mime,name};
  },
  getUuid:randomUUID,
  computeDigest(algorithm,value){assert.equal(algorithm,'SHA_256');return signed(createHash('sha256').update(String(value)).digest());},
  computeHmacSha256Signature(value,key){return signed(createHmac('sha256',String(key)).update(String(value)).digest());},
  base64Decode(value){return signed(Buffer.from(String(value),'base64'));},
  DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'}
 };
 const files=new Map(),folders=new Map();
 const driveApp={
  createFolder(name){
   const id='test-folder-'+(folders.size+1);const folder={getId(){return id;},createFile(blob){
    const fileId='test-image-'+(files.size+1);
    files.set(fileId,{blob,trashed:false});metrics.uploads++;
    return {getId(){return fileId;}};
   }};folders.set(id,{folder,name});return folder;
  },
  getFolderById(id){const item=folders.get(id);if(!item)throw Error('FAKE_FOLDER_NOT_FOUND:'+id);return item.folder;},
  getFileById(id){const file=files.get(id);if(!file)throw Error('FAKE_IMAGE_NOT_FOUND:'+id);return{
   setTrashed(value){file.trashed=Boolean(value);metrics.deletions++;}
  };}
 };
 const logs=[];
 const propertyValues=new Map([['VEHICLE_SHEET_ID',SANDBOX_ID]]);
 const scriptProperties={getProperty:key=>propertyValues.get(key)||null,setProperty:(key,value)=>propertyValues.set(key,value),deleteProperty:key=>propertyValues.delete(key)};
 const globals={
  SpreadsheetApp:spreadsheetApp,LockService:lockService,Utilities:utilities,DriveApp:driveApp,
  PropertiesService:{getScriptProperties:()=>scriptProperties},
  UrlFetchApp:{fetch(){throw Error('GOOGLE_OIDC_NETWORK_BLOCKED_IN_SYNTHETIC_TEST');}},
  Logger:{log:value=>logs.push(String(value))},console,
  ContentService:{MimeType:{JSON:'JSON'},createTextOutput:x=>({value:x,setMimeType(){return this;}})}
 };
 const context=vm.createContext(globals);
 const modules=readdirSync(join(root,'dist')).filter(x=>x.endsWith('.gs')).sort();
 for(const file of modules)new vm.Script(readFileSync(join(root,'dist',file),'utf8'),{filename:file}).runInContext(context);
 return {context,data,metrics,logs,modules,propertyValues};
}

test('GAS-VM-00 compiled reference seed preview is read-only and checksum-bound',()=>{
 const {context,data,metrics,logs}=makeFakeGAS();
 const before=JSON.stringify(data.get('vc_reference_values'));
 assert.equal(typeof context.previewVehicleReferenceSeedFromEditor,'function');
 const result=context.previewVehicleReferenceSeedFromEditor();
 assert.equal(result.status,'READY');assert.equal(result.rowCount,121);assert.equal(result.addCount,121);
 assert.match(result.checksum,/^[a-f0-9]{64}$/);assert.equal(result.dataModified,false);
 assert.equal(JSON.stringify(data.get('vc_reference_values')),before);assert.equal(metrics.writes,0);assert.ok(logs.length>0);
});

test('GAS-VM-01 compiled Editor authentication + lookup probes execute with canonical fake Sheets and real PBKDF2',()=>{
 const {context,metrics,logs,modules}=makeFakeGAS();
 assert.equal(typeof context.runVehicleStagingAuthTestsFromEditor,'function');
 const result=context.runVehicleStagingAuthTestsFromEditor();
 assert.equal(result.failed,0,JSON.stringify(result.cases.filter(x=>x.result!=='PASS')));
 assert.equal(result.passed,result.tests);
 assert.ok(result.tests>=15);
 assert.ok(metrics.opens>0);
 assert.ok(metrics.reads>0);
 assert.ok(metrics.writes>0);
 assert.ok(modules.length>=48);
 assert.ok(logs.length>0);
 console.log('Compiled GAS VM Editor AUTH acceptance PASSED '+result.passed+'/'+result.tests);
});

test('GAS-VM-02 compiled Editor full vehicle lifecycle operates on fake Sheets and Drive with 5 uploaded images',()=>{
 const {context,metrics,logs,data}=makeFakeGAS();
 assert.equal(typeof context.runVehicleStagingLifecycleTestsFromEditor,'function');
 const result=context.runVehicleStagingLifecycleTestsFromEditor();
 assert.equal(result.failed,0,JSON.stringify(result.cases.filter(x=>x.result!=='PASS')));
 assert.equal(result.passed,result.tests);
 assert.ok(result.tests>=15);
 assert.ok(metrics.uploads>=6,'five initial images plus replacement uploaded');
 assert.ok(metrics.deletions>=6,'replacement+retention should trash fake files');
 assert.equal(data.get('vc_vehicles').length,2,'only canonical fixture vehicle should remain after deleting generated one');
 assert.ok(logs.length>0);
 console.log('Compiled GAS VM Editor LIFECYCLE acceptance PASSED '+result.passed+'/'+result.tests);
});
