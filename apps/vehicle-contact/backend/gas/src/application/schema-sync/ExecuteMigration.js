import {DATABASE_SCHEMA} from '../../domain/ports/SchemaRepository.js';
// Editor-only forward-only migration. Never reorder, drop, or overwrite existing data.
export function createAdditiveMigration({spreadsheetApp,spreadsheetId,lockService,driveApp,propertiesService}) {
 if(!spreadsheetApp||!spreadsheetId||!lockService)throw new Error('MIGRATION_NOT_CONFIGURED');
 function inspect(book){
  const steps=[],blocked=[];
  for(const [name,definition] of Object.entries(DATABASE_SCHEMA.tables)){
   const expected=definition.columns.map(c=>c.name),sheet=book.getSheetByName(name);
   if(!sheet){steps.push({kind:'CREATE_TABLE',table:name,columns:expected});continue;}
   const count=sheet.getLastColumn();
   const actual=count?sheet.getRange(1,1,1,count).getDisplayValues()[0].map(String):[];
   if(actual.some(c=>!c)||new Set(actual).size!==actual.length){blocked.push({table:name,reason:'INVALID_HEADERS'});continue;}
   if(actual.some(c=>!expected.includes(c))){blocked.push({table:name,reason:'UNKNOWN_COLUMNS'});continue;}
   if(actual.some((c,i)=>c!==expected[i])){blocked.push({table:name,reason:'COLUMN_ORDER_CONFLICT'});continue;}
   const missing=expected.slice(actual.length);
   if(missing.length)steps.push({kind:'APPEND_COLUMNS',table:name,columns:missing,existingCount:actual.length});
  }
  return {schemaId:DATABASE_SCHEMA.schemaId,schemaVersion:DATABASE_SCHEMA.schemaVersion,steps,blocked};
 }
 function setJournal(book,state){
  if(propertiesService)propertiesService.getScriptProperties().setProperty('VEHICLE_MIGRATION_JOURNAL',JSON.stringify(state));
  const sheet=book.getSheetByName('vc_migration_journal');
  if(!sheet)return;
  const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
  const values=sheet.getDataRange().getValues(),key=DATABASE_SCHEMA.schemaVersion;
  const col=headers.indexOf('migration_id'),row=values.findIndex((x,i)=>i>0&&x[col]===key);
  const data={
   migration_id:key,schema_version:key,status:state.status,backup_ref:state.backupRef||'',
   started_at:state.startedAt||'',completed_at:state.completedAt||'',error:state.error||''
  };
  const output=headers.map(h=>data[h]===undefined?'':data[h]);
  if(row>=1)sheet.getRange(row+1,1,1,headers.length).setValues([output]);else sheet.appendRow(output);
 }
 function applyStep(book,step){
  if(step.kind==='CREATE_TABLE'){
   if(book.getSheetByName(step.table))throw new Error('MIGRATION_CONCURRENT_DRIFT');
   const sheet=book.insertSheet(step.table);
   if(sheet.getMaxColumns()<step.columns.length)sheet.insertColumnsAfter(sheet.getMaxColumns(),step.columns.length-sheet.getMaxColumns());
   sheet.getRange(1,1,1,step.columns.length).setValues([step.columns]);
  }else if(step.kind==='APPEND_COLUMNS'){
   const sheet=book.getSheetByName(step.table),count=sheet.getLastColumn();
   if(count!==step.existingCount)throw new Error('MIGRATION_CONCURRENT_DRIFT');
   const size=count+step.columns.length;
   if(sheet.getMaxColumns()<size)sheet.insertColumnsAfter(sheet.getMaxColumns(),size-sheet.getMaxColumns());
   sheet.getRange(1,count+1,1,step.columns.length).setValues([step.columns]);
  }else throw new Error('UNSUPPORTED_MIGRATION_STEP');
 }
 function run({dryRun=true,approvalCode}={}){
  if(dryRun!==true&&approvalCode!=='APPROVE_ADDITIVE_SCHEMA_MIGRATION')throw new Error('EXPLICIT_APPROVAL_REQUIRED');
  const lock=lockService.getScriptLock();
  if(!lock.tryLock(25000))throw new Error('MIGRATION_BUSY');
  try{
   const book=spreadsheetApp.openById(spreadsheetId),plan=inspect(book);
   if(plan.blocked.length)return {...plan,applied:false,status:'BLOCKED'};
   if(dryRun)return {...plan,applied:false,status:'DRY_RUN'};
   if(!driveApp||!propertiesService)throw new Error('MIGRATION_BACKUP_NOT_CONFIGURED');
   const props=propertiesService.getScriptProperties();
   const previousRaw=props.getProperty('VEHICLE_MIGRATION_JOURNAL');
   const previous=previousRaw?JSON.parse(previousRaw):null;
   if(previous&&['APPLYING','RECOVERY_REQUIRED','PREPARED'].includes(previous.status))
    throw new Error('MIGRATION_RECOVERY_REQUIRED');
   if(previous&&previous.status==='APPLIED'&&previous.schemaVersion===plan.schemaVersion&&!plan.steps.length)
    return {...plan,applied:false,status:'ALREADY_APPLIED'};
   const startedAt=new Date().toISOString();
   const backup=driveApp.getFileById(spreadsheetId).makeCopy('p6vc-schema-backup-'+plan.schemaVersion+'-'+startedAt.replace(/[:.]/g,'-'));
   if(!backup||!backup.getId())throw new Error('MIGRATION_BACKUP_FAILED');
   const state={schemaVersion:plan.schemaVersion,backupRef:backup.getId(),startedAt,status:'PREPARED'};
   setJournal(book,state);
   state.status='APPLYING';setJournal(book,state);
   try{
    for(const step of plan.steps)applyStep(book,step);
    const verified=inspect(book);
    if(verified.blocked.length||verified.steps.length)throw new Error('POST_MIGRATION_VERIFICATION_FAILED');
    state.status='APPLIED';state.completedAt=new Date().toISOString();setJournal(book,state);
    return {...plan,applied:true,status:'APPLIED',backupRef:state.backupRef};
   }catch(e){
    state.status='RECOVERY_REQUIRED';state.error=String(e&&e.message||'UNKNOWN').slice(0,200);
    try{setJournal(book,state);}catch(_){props.setProperty('VEHICLE_MIGRATION_JOURNAL',JSON.stringify(state));}
    throw e;
   }
  }finally{lock.releaseLock();}
 }
 return Object.freeze({run});
}
