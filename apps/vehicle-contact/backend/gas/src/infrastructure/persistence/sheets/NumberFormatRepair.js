import {DATABASE_SCHEMA} from '../../../domain/ports/SchemaRepository.js';

// Format-only repair for the setNumberFormat(singular)-with-array display bug.
// Reads current per-cell formats, reports mismatches per sheet, then re-applies
// the correct per-column format matrix via setNumberFormats(plural).
// NEVER reads/writes cell VALUES; stored data is untouched.
const FORMAT_BY_TYPE={string:'@','datetime-iso8601':'@',integer:'General',boolean:'General'};
// Sheets reports numeric General-format cells as '0.###############' (its internal
// auto numeric format), not the literal 'General'. Both display numbers/booleans
// plainly, so treat them as equivalent — otherwise integer/boolean columns are
// flagged as mismatched forever and rewritten on every pass (false positive).
const NUMERIC_GENERAL=new Set(['General','0.###############']);
function formatMatches(actual,desired){return desired==='General'?NUMERIC_GENERAL.has(actual):actual===desired;}

export function normalizeNumberFormats({spreadsheetApp,spreadsheetId,lockService}){
 if(!spreadsheetApp||!spreadsheetId||!lockService)throw new Error('STORAGE_NOT_CONFIGURED');
 const lock=lockService.getScriptLock();
 if(!lock.tryLock(15000))throw new Error('BUSY');
 try{
  const book=spreadsheetApp.openById(spreadsheetId);
  const sheets=[];
  for(const [name,def] of Object.entries(DATABASE_SCHEMA.tables)){
   const sheet=book.getSheetByName(name);
   if(!sheet){sheets.push({name,skipped:'MISSING_TABLE'});continue;}
   const lastRow=sheet.getLastRow(),lastCol=sheet.getLastColumn();
   const columns=def.columns;
   if(lastRow<2){sheets.push({name,dataRows:0,mismatchedCellsBefore:0,applied:false});continue;}
   if(lastCol!==columns.length){sheets.push({name,skipped:'SCHEMA_MISMATCH',lastCol,expected:columns.length});continue;}
   const desired=columns.map(c=>FORMAT_BY_TYPE[c.type]||'@');
   const range=sheet.getRange(2,1,lastRow-1,lastCol);
   const current=range.getNumberFormats();
   let mismatched=0;
   const colMismatch=columns.map(()=>({count:0,actual:new Set()}));
   const matrix=current.map(row=>row.map((f,j)=>{
    if(!formatMatches(f,desired[j])){mismatched++;colMismatch[j].count++;if(colMismatch[j].actual.size<3)colMismatch[j].actual.add(f);}
    return desired[j];
   }));
   if(mismatched>0)range.setNumberFormats(matrix);
   const mismatchDetail=colMismatch.map((m,j)=>m.count?{column:columns[j].name,type:columns[j].type,desired:desired[j],count:m.count,actual:[...m.actual]}:null).filter(Boolean);
   sheets.push({name,dataRows:lastRow-1,columns:lastCol,mismatchedCellsBefore:mismatched,applied:mismatched>0,mismatchDetail});
  }
  const totalMismatched=sheets.reduce((n,s)=>n+(s.mismatchedCellsBefore||0),0);
  const totalApplied=sheets.filter(s=>s.applied).length;
  return {status:'OK',sheets,totalMismatched,totalApplied,valuesUntouched:true};
 }finally{lock.releaseLock();}
}