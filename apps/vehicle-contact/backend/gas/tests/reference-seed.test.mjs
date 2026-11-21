import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {REFERENCE_SEED_V1} from '../src/domain/reference/ReferenceSeedV1.js';
import {createReferenceSeedInstaller} from '../src/infrastructure/reference/ReferenceSeedInstaller.js';

const HEADERS=['reference_id','catalog','code','label_th','parent_code','sort_order','status','updated_by','updated_at'];
class Range{
 constructor(sheet,row,column,rows,columns){Object.assign(this,{sheet,row,column,rows,columns});}
 values(){return Array.from({length:this.rows},(_,r)=>Array.from({length:this.columns},(_,c)=>this.sheet.data[this.row-1+r]?.[this.column-1+c]??''));}
 getDisplayValues(){return this.values().map(row=>row.map(String));}
 getValues(){return this.values();}
 setNumberFormat(){return this;}
 clearContents(){
  for(let r=0;r<this.rows;r++)for(let c=0;c<this.columns;c++)if(this.sheet.data[this.row-1+r])this.sheet.data[this.row-1+r][this.column-1+c]='';
 }
 setValues(values){
  if(this.sheet.failWrite)throw new Error('INJECTED_REFERENCE_WRITE_FAILURE');
  assert.equal(values.length,this.rows);
  for(let r=0;r<this.rows;r++){
   this.sheet.data[this.row-1+r]??=[];
   for(let c=0;c<this.columns;c++)this.sheet.data[this.row-1+r][this.column-1+c]=values[r][c];
  }
 }
}
// Emulates real Sheets USER_ENTERED semantics: without a plain-text format, numeric strings
// become numbers and ISO timestamps become Date objects on write.
const coerce=value=>{
 if(typeof value==='string'&&/^\d+$/.test(value))return Number(value);
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value))return new Date(value);
 return value;
};
class CoercingRange extends Range{
 setNumberFormat(format){this.format=format;return this;}
 setValues(values){
  if(this.sheet.failWrite)throw new Error('INJECTED_REFERENCE_WRITE_FAILURE');
  assert.equal(values.length,this.rows);
  for(let r=0;r<this.rows;r++){
   this.sheet.data[this.row-1+r]??=[];
   for(let c=0;c<this.columns;c++){
    const value=values[r][c];
    this.sheet.data[this.row-1+r][this.column-1+c]=this.format==='@'?String(value):coerce(value);
   }
  }
 }
}
class Sheet{
 constructor(rows=[HEADERS]){this.data=rows.map(row=>[...row]);this.failWrite=false;}
 getLastColumn(){return this.data[0]?.length||0;}
 getLastRow(){
  for(let i=this.data.length-1;i>=0;i--)if(this.data[i].some(value=>String(value).trim()!==''))return i+1;
  return 0;
 }
 getRange(row,column,rows,columns){return new Range(this,row,column,rows,columns);}
}
class CoercingSheet extends Sheet{
 getRange(row,column,rows,columns){return new CoercingRange(this,row,column,rows,columns);}
}
function fixture(rows=[HEADERS],{coercing=false}={}){
 const sheet=new (coercing?CoercingSheet:Sheet)(rows),values=new Map([['VEHICLE_SHEET_ID','sheet-1']]),backups=[];
 const props={getProperty:key=>values.get(key)||null,setProperty:(key,value)=>values.set(key,value),deleteProperty:key=>values.delete(key)};
 const lock={tryLock:()=>true,releaseLock(){}};
 const utilities={DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'},computeDigest(_algorithm,value){return [...createHash('sha256').update(value).digest()];}};
 const deps={spreadsheetApp:{openById:id=>{assert.equal(id,'sheet-1');return{getSheetByName:name=>name==='vc_reference_values'?sheet:null};}},
  spreadsheetId:'sheet-1',lockService:{getScriptLock:()=>lock},propertiesService:{getScriptProperties:()=>props},utilities,
  driveApp:{getFileById:id=>({makeCopy:name=>{assert.equal(id,'sheet-1');backups.push(name);return{getId:()=>`backup-${backups.length}`};}})},
  clock:(()=>{let second=0;return()=>`2026-11-21T00:00:0${second++}.000Z`;})()};
 return {sheet,values,backups,installer:createReferenceSeedInstaller(deps)};
}

test('approved manifest contains exactly the reviewed deterministic catalogs',()=>{
 assert.equal(REFERENCE_SEED_V1.rows.length,645);
 const count=catalog=>REFERENCE_SEED_V1.rows.filter(row=>row.catalog===catalog).length;
 assert.deepEqual({province:count('PROVINCE'),vehicle:count('VEHICLE_TYPE'),plate:count('PLATE_TYPE'),relationship:count('RELATIONSHIP'),color:count('COLOR'),brand:count('BRAND')},
  {province:77,vehicle:17,plate:5,relationship:6,color:16,brand:524});
 assert.equal(new Set(REFERENCE_SEED_V1.rows.map(row=>row.reference_id)).size,645);
 assert.equal(REFERENCE_SEED_V1.rows.find(row=>row.code==='10').label_th,'กรุงเทพมหานคร');
 assert.equal(REFERENCE_SEED_V1.rows.find(row=>row.code==='RY17').label_th,'รถจักรยานยนต์สาธารณะ');
 assert.equal(REFERENCE_SEED_V1.rows.find(row=>row.code==='TOYOTA').label_th,'TOYOTA');
 assert.equal(REFERENCE_SEED_V1.rows.some(row=>row.catalog==='BRAND'&&row.label_th==='ไม่ระบุ'),false);
});

test('preview is deterministic and never writes or backs up',()=>{
 const f=fixture(),result=f.installer.preview();
 assert.equal(result.status,'READY');assert.equal(result.rowCount,645);assert.equal(result.addCount,645);
 assert.match(result.checksum,/^[a-f0-9]{64}$/);assert.equal(result.dataModified,false);
 assert.equal(f.sheet.getLastRow(),1);assert.equal(f.backups.length,0);
 assert.equal(f.installer.preview().checksum,result.checksum);
});

test('apply requires the exact preview checksum',()=>{
 const f=fixture();
 f.values.set('VEHICLE_REFERENCE_SEED_APPROVED_SHA256','wrong');
 assert.throws(()=>f.installer.apply(),/EXPLICIT_APPROVAL_REQUIRED/);
 assert.equal(f.sheet.getLastRow(),1);assert.equal(f.backups.length,0);
});

test('approved apply backs up, journals, verifies, consumes approval and is idempotent',()=>{
 const f=fixture(),preview=f.installer.preview();
 f.values.set('VEHICLE_REFERENCE_SEED_APPROVED_SHA256',preview.checksum);
 const applied=f.installer.apply();
 assert.equal(applied.status,'APPLIED');assert.equal(applied.dataModified,true);assert.equal(applied.backupCreated,true);
 assert.equal(f.sheet.getLastRow(),646);assert.equal(f.backups.length,1);
 assert.equal(f.values.has('VEHICLE_REFERENCE_SEED_APPROVED_SHA256'),false);
 const journal=JSON.parse(f.values.get('VEHICLE_REFERENCE_SEED_JOURNAL'));
 assert.equal(journal.status,'APPLIED');assert.equal(journal.checksum,preview.checksum);assert.equal(journal.backupRef,'backup-1');
 assert.equal(f.installer.preview().status,'ALREADY_APPLIED');
 f.values.set('VEHICLE_REFERENCE_SEED_APPROVED_SHA256',preview.checksum);
 assert.equal(f.installer.apply().status,'ALREADY_APPLIED');
 assert.equal(f.backups.length,1);assert.equal(f.values.has('VEHICLE_REFERENCE_SEED_APPROVED_SHA256'),false);
});

test('partial or foreign existing data blocks without overwrite or backup',()=>{
 const row=['existing','PROVINCE','10','ค่าเดิม','',1,'ACTIVE','manual','2026-11-20T00:00:00.000Z'];
 const f=fixture([HEADERS,row]),preview=f.installer.preview();
 assert.equal(preview.status,'BLOCKED');assert.equal(preview.existingCount,1);
 f.values.set('VEHICLE_REFERENCE_SEED_APPROVED_SHA256',preview.checksum);
 assert.throws(()=>f.installer.apply(),/REFERENCE_SEED_CONFLICT/);
 assert.deepEqual(f.sheet.data,[HEADERS,row]);assert.equal(f.backups.length,0);
 assert.equal(f.values.has('VEHICLE_REFERENCE_SEED_APPROVED_SHA256'),false);
});

test('write failure enters recovery-required and consumes approval',()=>{
 const f=fixture(),preview=f.installer.preview();
 f.values.set('VEHICLE_REFERENCE_SEED_APPROVED_SHA256',preview.checksum);f.sheet.failWrite=true;
 assert.throws(()=>f.installer.apply(),/INJECTED_REFERENCE_WRITE_FAILURE/);
 assert.equal(f.backups.length,1);assert.equal(f.values.has('VEHICLE_REFERENCE_SEED_APPROVED_SHA256'),false);
 assert.equal(JSON.parse(f.values.get('VEHICLE_REFERENCE_SEED_JOURNAL')).status,'RECOVERY_REQUIRED');
});

test('apply survives real Sheets USER_ENTERED coercion via plain-text format',()=>{
 const f=fixture([HEADERS],{coercing:true}),preview=f.installer.preview();
 f.values.set('VEHICLE_REFERENCE_SEED_APPROVED_SHA256',preview.checksum);
 const applied=f.installer.apply();
 assert.equal(applied.status,'APPLIED');assert.equal(applied.dataModified,true);
 const province=f.sheet.data.find(row=>row[0]==='REF-PROVINCE-10');
 assert.equal(province[2],'10');assert.equal(typeof province[2],'string');
 assert.equal(province[8],'2026-11-20T00:00:00.000Z');assert.equal(typeof province[8],'string');
 assert.equal(f.installer.preview().status,'ALREADY_APPLIED');
});

test('coerced legacy rows are BLOCKED, never silently accepted',()=>{
 const dirty=['REF-PROVINCE-10','PROVINCE',10,'กรุงเทพมหานคร','',1,'ACTIVE','REFERENCE_SEED_V1',new Date('2026-11-20T00:00:00.000Z')];
 const f=fixture([HEADERS,dirty],{coercing:true});
 const preview=f.installer.preview();
 assert.equal(preview.status,'BLOCKED');assert.equal(preview.existingCount,1);
});

test('recover requires explicit approval and a recovery journal',()=>{
 const f=fixture();
 assert.throws(()=>f.installer.recover(),/RECOVERY_APPROVAL_REQUIRED/);
 f.values.set('VEHICLE_REFERENCE_SEED_RECOVERY_APPROVED','true');
 assert.throws(()=>f.installer.recover(),/RECOVERY_NOT_REQUIRED/);
 assert.equal(f.values.has('VEHICLE_REFERENCE_SEED_RECOVERY_APPROVED'),false);
 assert.equal(f.sheet.getLastRow(),1);
});

test('recover clears only seed-owned rows, journals RECOVERED, then reapply succeeds',()=>{
 const dirty=[
  ['REF-PROVINCE-10','PROVINCE',10,'กรุงเทพมหานคร','',1,'ACTIVE','REFERENCE_SEED_V1',new Date('2026-11-20T00:00:00.000Z')],
  ['REF-BRAND-TOYOTA','BRAND','TOYOTA','TOYOTA','',1,'ACTIVE','REFERENCE_SEED_V1',new Date('2026-11-20T00:00:00.000Z')]
 ];
 const f=fixture([HEADERS,...dirty],{coercing:true});
 f.values.set('VEHICLE_REFERENCE_SEED_JOURNAL',JSON.stringify({status:'RECOVERY_REQUIRED',backupRef:'backup-1',checksum:'prior'}));
 f.values.set('VEHICLE_REFERENCE_SEED_RECOVERY_APPROVED','true');
 const recovered=f.installer.recover();
 assert.equal(recovered.status,'RECOVERED');assert.equal(recovered.clearedCount,2);assert.equal(recovered.dataModified,true);
 assert.equal(f.values.has('VEHICLE_REFERENCE_SEED_RECOVERY_APPROVED'),false);
 const journal=JSON.parse(f.values.get('VEHICLE_REFERENCE_SEED_JOURNAL'));
 assert.equal(journal.status,'RECOVERED');assert.equal(journal.previousStatus,'RECOVERY_REQUIRED');assert.equal(journal.backupRef,'backup-1');
 assert.equal(f.sheet.getLastRow(),1);
 const preview=f.installer.preview();
 assert.equal(preview.status,'READY');
 f.values.set('VEHICLE_REFERENCE_SEED_APPROVED_SHA256',preview.checksum);
 assert.equal(f.installer.apply().status,'APPLIED');
 assert.equal(f.installer.preview().status,'ALREADY_APPLIED');
});

test('recover refuses foreign rows and missing backup reference',()=>{
 const foreign=['REF-PROVINCE-10','PROVINCE','10','กรุงเทพมหานคร','',1,'ACTIVE','manual','2026-11-20T00:00:00.000Z'];
 const f=fixture([HEADERS,foreign]);
 f.values.set('VEHICLE_REFERENCE_SEED_JOURNAL',JSON.stringify({status:'RECOVERY_REQUIRED',backupRef:'backup-1'}));
 f.values.set('VEHICLE_REFERENCE_SEED_RECOVERY_APPROVED','true');
 assert.throws(()=>f.installer.recover(),/RECOVERY_CONFLICT/);
 assert.equal(f.sheet.getLastRow(),2);
 assert.equal(f.values.has('VEHICLE_REFERENCE_SEED_RECOVERY_APPROVED'),false);
 const g=fixture();
 g.values.set('VEHICLE_REFERENCE_SEED_JOURNAL',JSON.stringify({status:'RECOVERY_REQUIRED'}));
 g.values.set('VEHICLE_REFERENCE_SEED_RECOVERY_APPROVED','true');
 assert.throws(()=>g.installer.recover(),/RECOVERY_BACKUP_MISSING/);
});

test('write-failure recovery path rejoins a clean apply under coercion',()=>{
 const f=fixture([HEADERS],{coercing:true}),preview=f.installer.preview();
 f.values.set('VEHICLE_REFERENCE_SEED_APPROVED_SHA256',preview.checksum);f.sheet.failWrite=true;
 assert.throws(()=>f.installer.apply(),/INJECTED_REFERENCE_WRITE_FAILURE/);
 f.sheet.failWrite=false;
 f.values.set('VEHICLE_REFERENCE_SEED_APPROVED_SHA256',preview.checksum);
 assert.throws(()=>f.installer.apply(),/REFERENCE_SEED_RECOVERY_REQUIRED/);
 f.values.set('VEHICLE_REFERENCE_SEED_RECOVERY_APPROVED','true');
 assert.equal(f.installer.recover().status,'RECOVERED');
 f.values.set('VEHICLE_REFERENCE_SEED_APPROVED_SHA256',preview.checksum);
 assert.equal(f.installer.apply().status,'APPLIED');
 assert.equal(f.installer.preview().status,'ALREADY_APPLIED');
});

