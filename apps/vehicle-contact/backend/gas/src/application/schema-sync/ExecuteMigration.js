import { DATABASE_SCHEMA } from "../../domain/ports/SchemaRepository.js";

// Editor-only, additive migration. Existing data is never deleted, renamed or reordered.
export function createAdditiveMigration({spreadsheetApp,spreadsheetId,lockService}) {
 if(!spreadsheetApp||!spreadsheetId||!lockService)throw new Error('MIGRATION_NOT_CONFIGURED');
 function inspect(book) {
  const steps=[],blocked=[];
  for(const [name,definition] of Object.entries(DATABASE_SCHEMA.tables)){
   const expected=definition.columns.map(c=>c.name);
   const sheet=book.getSheetByName(name);
   if(!sheet){steps.push({kind:'CREATE_TABLE',table:name,columns:expected});continue;}
   const count=sheet.getLastColumn();
   const actual=count?sheet.getRange(1,1,1,count).getDisplayValues()[0].map(String):[];
   if(new Set(actual).size!==actual.length||actual.some(x=>!x)) {blocked.push({table:name,reason:'INVALID_HEADERS'});continue;}
   if(actual.some(x=>!expected.includes(x))) {blocked.push({table:name,reason:'UNKNOWN_COLUMNS'});continue;}
   // Never shift columns: existing headers must be an exact prefix of canonical headers.
   if(actual.some((x,i)=>x!==expected[i])) {blocked.push({table:name,reason:'COLUMN_ORDER_CONFLICT'});continue;}
   const missing=expected.slice(actual.length);
   if(missing.length)steps.push({kind:'APPEND_COLUMNS',table:name,columns:missing,existingCount:actual.length});
  }
  return {schemaId:DATABASE_SCHEMA.schemaId,schemaVersion:DATABASE_SCHEMA.schemaVersion,steps,blocked};
 }
 function run({dryRun=true,approvalCode}={}) {
  if(dryRun!==true&&approvalCode!=='APPROVE_ADDITIVE_SCHEMA_MIGRATION')throw new Error('EXPLICIT_APPROVAL_REQUIRED');
  const lock=lockService.getScriptLock();
  if(!lock.tryLock(20000))throw new Error('MIGRATION_BUSY');
  try {
   const book=spreadsheetApp.openById(spreadsheetId);
   const plan=inspect(book);
   if(plan.blocked.length) return {...plan,applied:false,status:'BLOCKED'};
   if(dryRun)return {...plan,applied:false,status:'DRY_RUN'};
   const applied=[];
   for(const step of plan.steps){
    if(step.kind==='CREATE_TABLE'){
     const sheet=book.insertSheet(step.table);
     if(sheet.getMaxColumns()<step.columns.length)sheet.insertColumnsAfter(sheet.getMaxColumns(),step.columns.length-sheet.getMaxColumns());
     sheet.getRange(1,1,1,step.columns.length).setValues([step.columns]);
    }else{
     const sheet=book.getSheetByName(step.table);
     const last=step.existingCount+step.columns.length;
     if(sheet.getMaxColumns()<last)sheet.insertColumnsAfter(sheet.getMaxColumns(),last-sheet.getMaxColumns());
     sheet.getRange(1,step.existingCount+1,1,step.columns.length).setValues([step.columns]);
    }
    applied.push({kind:step.kind,table:step.table,columns:step.columns});
   }
   return {...plan,applied:true,status:'APPLIED',appliedSteps:applied};
  }finally{lock.releaseLock();}
 }
 return Object.freeze({run});
}
