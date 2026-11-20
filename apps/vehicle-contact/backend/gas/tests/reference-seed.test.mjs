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
 setValues(values){
  if(this.sheet.failWrite)throw new Error('INJECTED_REFERENCE_WRITE_FAILURE');
  assert.equal(values.length,this.rows);
  for(let r=0;r<this.rows;r++){
   this.sheet.data[this.row-1+r]??=[];
   for(let c=0;c<this.columns;c++)this.sheet.data[this.row-1+r][this.column-1+c]=values[r][c];
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
function fixture(rows=[HEADERS]){
 const sheet=new Sheet(rows),values=new Map([['VEHICLE_SHEET_ID','sheet-1']]),backups=[];
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
 assert.equal(REFERENCE_SEED_V1.rows.length,121);
 const count=catalog=>REFERENCE_SEED_V1.rows.filter(row=>row.catalog===catalog).length;
 assert.deepEqual({province:count('PROVINCE'),vehicle:count('VEHICLE_TYPE'),plate:count('PLATE_TYPE'),relationship:count('RELATIONSHIP'),color:count('COLOR')},
  {province:77,vehicle:17,plate:5,relationship:6,color:16});
 assert.equal(new Set(REFERENCE_SEED_V1.rows.map(row=>row.reference_id)).size,121);
 assert.equal(REFERENCE_SEED_V1.rows.find(row=>row.code==='10').label_th,'กรุงเทพมหานคร');
 assert.equal(REFERENCE_SEED_V1.rows.find(row=>row.code==='RY17').label_th,'รถจักรยานยนต์สาธารณะ');
});

test('preview is deterministic and never writes or backs up',()=>{
 const f=fixture(),result=f.installer.preview();
 assert.equal(result.status,'READY');assert.equal(result.rowCount,121);assert.equal(result.addCount,121);
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
 assert.equal(f.sheet.getLastRow(),122);assert.equal(f.backups.length,1);
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

