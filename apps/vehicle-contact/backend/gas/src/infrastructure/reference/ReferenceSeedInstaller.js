import {REFERENCE_SEED_V1} from '../../domain/reference/ReferenceSeedV1.js';

const TABLE='vc_reference_values';
const APPROVAL='VEHICLE_REFERENCE_SEED_APPROVED_SHA256';
const JOURNAL='VEHICLE_REFERENCE_SEED_JOURNAL';
const HEADERS=Object.freeze(['reference_id','catalog','code','label_th','parent_code','sort_order','status','updated_by','updated_at']);
const invalid=code=>{throw new Error(code);};
const text=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/^[=+@-]/.test(value);
const hex=bytes=>Array.from(bytes,value=>(value&255).toString(16).padStart(2,'0')).join('');

export function createReferenceSeedInstaller({spreadsheetApp,spreadsheetId,lockService,driveApp,propertiesService,utilities,clock=()=>new Date().toISOString()}){
 if(!spreadsheetApp||!spreadsheetId||!lockService||!propertiesService||!utilities)invalid('REFERENCE_SEED_NOT_CONFIGURED');
 const props=propertiesService.getScriptProperties();
 const canonical=JSON.stringify({seedVersion:REFERENCE_SEED_V1.seedVersion,schemaVersion:REFERENCE_SEED_V1.schemaVersion,rows:REFERENCE_SEED_V1.rows});
 const checksum=hex(utilities.computeDigest(utilities.DigestAlgorithm.SHA_256,canonical,utilities.Charset.UTF_8));
 function validateManifest(){
  const ids=new Set(),codes=new Set(),counts={};
  if(REFERENCE_SEED_V1.rows.length!==645||!/^[a-f0-9]{64}$/.test(checksum))invalid('REFERENCE_SEED_MANIFEST_INVALID');
  for(const row of REFERENCE_SEED_V1.rows){
   const key=row.catalog+'|'+row.code;
   if(!text(row.reference_id,100)||!text(row.catalog,32)||!text(row.code,64)||!text(row.label_th,120)
    ||row.parent_code!==''||!Number.isSafeInteger(row.sort_order)||row.sort_order<1
    ||row.status!=='ACTIVE'||row.updated_by!=='REFERENCE_SEED_V1'
    ||row.updated_at!=='2026-11-20T00:00:00.000Z'||ids.has(row.reference_id)||codes.has(key))
    invalid('REFERENCE_SEED_MANIFEST_INVALID');
   ids.add(row.reference_id);codes.add(key);counts[row.catalog]=(counts[row.catalog]||0)+1;
  }
  if(counts.PROVINCE!==77||counts.VEHICLE_TYPE!==17||counts.PLATE_TYPE!==5||counts.RELATIONSHIP!==6
   ||counts.COLOR!==16||counts.BRAND!==524||Object.keys(counts).length!==6)invalid('REFERENCE_SEED_MANIFEST_INVALID');
 }
 function rowValues(row){return HEADERS.map(header=>row[header]);}
 function inspect(book){
  validateManifest();
  const sheet=book.getSheetByName(TABLE);
  if(!sheet)invalid('REFERENCE_SEED_TABLE_MISSING');
  const count=sheet.getLastColumn();
  const headers=count?sheet.getRange(1,1,1,count).getDisplayValues()[0].map(String):[];
  if(JSON.stringify(headers)!==JSON.stringify(HEADERS))invalid('REFERENCE_SEED_HEADERS_INVALID');
  const lastRow=sheet.getLastRow();
  const existing=lastRow>1?sheet.getRange(2,1,lastRow-1,HEADERS.length).getValues()
   .filter(row=>row.some(value=>String(value).trim()!=='')):[];
  if(!existing.length)return {status:'READY',addCount:REFERENCE_SEED_V1.rows.length,existingCount:0};
  const expected=REFERENCE_SEED_V1.rows.map(rowValues);
  if(JSON.stringify(existing)===JSON.stringify(expected))return {status:'ALREADY_APPLIED',addCount:0,existingCount:existing.length};
  return {status:'BLOCKED',addCount:0,existingCount:existing.length};
 }
 function result(state){return Object.freeze({
   status:state.status,seedVersion:REFERENCE_SEED_V1.seedVersion,schemaVersion:REFERENCE_SEED_V1.schemaVersion,
   checksum,rowCount:REFERENCE_SEED_V1.rows.length,addCount:state.addCount,existingCount:state.existingCount,
   mode:'ADVISORY',dataModified:false
  });}
 function preview(){
  const lock=lockService.getScriptLock();
  if(!lock.tryLock(25000))invalid('REFERENCE_SEED_BUSY');
  try{return result(inspect(spreadsheetApp.openById(spreadsheetId)));}
  finally{lock.releaseLock();}
 }
 function setJournal(state){props.setProperty(JOURNAL,JSON.stringify(state));}
 function apply(){
  if(props.getProperty(APPROVAL)!==checksum)invalid('REFERENCE_SEED_EXPLICIT_APPROVAL_REQUIRED');
  if(!driveApp)invalid('REFERENCE_SEED_BACKUP_NOT_CONFIGURED');
  const lock=lockService.getScriptLock();
  if(!lock.tryLock(25000))invalid('REFERENCE_SEED_BUSY');
  let state=null,consumed=true;
  try{
   const book=spreadsheetApp.openById(spreadsheetId),plan=inspect(book);
   if(plan.status==='ALREADY_APPLIED')return {...result(plan),status:'ALREADY_APPLIED'};
   if(plan.status!=='READY')invalid('REFERENCE_SEED_CONFLICT');
   const previousRaw=props.getProperty(JOURNAL),previous=previousRaw?JSON.parse(previousRaw):null;
   if(previous&&['PREPARED','APPLYING','RECOVERY_REQUIRED'].includes(previous.status))invalid('REFERENCE_SEED_RECOVERY_REQUIRED');
   const startedAt=clock();
   const backup=driveApp.getFileById(spreadsheetId).makeCopy('p6vc-reference-backup-'+REFERENCE_SEED_V1.seedVersion+'-'+startedAt.replace(/[:.]/g,'-'));
   if(!backup||!backup.getId())invalid('REFERENCE_SEED_BACKUP_FAILED');
   state={seedVersion:REFERENCE_SEED_V1.seedVersion,checksum,status:'PREPARED',backupRef:backup.getId(),startedAt};setJournal(state);
   state.status='APPLYING';setJournal(state);
   const sheet=book.getSheetByName(TABLE);
   sheet.getRange(2,1,REFERENCE_SEED_V1.rows.length,HEADERS.length).setValues(REFERENCE_SEED_V1.rows.map(rowValues));
   const verified=inspect(book);
   if(verified.status!=='ALREADY_APPLIED')invalid('REFERENCE_SEED_VERIFICATION_FAILED');
   state.status='APPLIED';state.completedAt=clock();setJournal(state);
   return Object.freeze({...result({status:'APPLIED',addCount:REFERENCE_SEED_V1.rows.length,existingCount:REFERENCE_SEED_V1.rows.length}),
    dataModified:true,backupCreated:true});
  }catch(error){
   if(state){state.status='RECOVERY_REQUIRED';state.error=String(error&&error.message||'UNKNOWN').slice(0,200);try{setJournal(state);}catch(_){}}
   throw error;
  }finally{
   lock.releaseLock();
   if(consumed)props.deleteProperty(APPROVAL);
  }
 }
 return Object.freeze({preview,apply,checksum});
}

