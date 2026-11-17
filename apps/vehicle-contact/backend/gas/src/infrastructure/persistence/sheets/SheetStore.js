import {DATABASE_SCHEMA} from '../../../domain/ports/SchemaRepository.js';

// GAS Sheets adapter: one Spreadsheet open, bounded/batched reads, execution-local cache.
// This is not a database transaction; callers use withLock only for conflicting writes.
const MAX_SCAN_ROWS=10000;
export function createSheetStore({spreadsheetApp,spreadsheetId,lockService}) {
 if(!spreadsheetApp||!spreadsheetId||!lockService)throw new Error('STORAGE_NOT_CONFIGURED');
 let locked=false,book=null;
 const sheets=new Map(),snapshot=new Map();
 function spreadsheet(){if(!book)book=spreadsheetApp.openById(spreadsheetId);return book;}
 function sheetOf(name){
  if(!Object.prototype.hasOwnProperty.call(DATABASE_SCHEMA.tables,name))throw new Error('UNKNOWN_TABLE');
  if(sheets.has(name))return sheets.get(name);
  const sheet=spreadsheet().getSheetByName(name);
  if(!sheet)throw new Error('MISSING_TABLE:'+name);
  sheets.set(name,sheet);return sheet;
 }
 function table(name){
  if(snapshot.has(name))return snapshot.get(name);
  const sheet=sheetOf(name);
  const expected=DATABASE_SCHEMA.tables[name].columns.map(c=>c.name);
  let values;
  if(typeof sheet.getLastRow==='function'&&typeof sheet.getLastColumn==='function'){
   const lastRow=sheet.getLastRow(),lastCol=sheet.getLastColumn();
   if(lastRow<1)throw new Error('MISSING_HEADERS:'+name);
   if(lastCol!==expected.length)throw new Error('SCHEMA_MISMATCH:'+name);
   if(lastRow-1>MAX_SCAN_ROWS)throw new Error('SCAN_LIMIT_EXCEEDED');
   // One bounded rectangular read, never getDataRange() over arbitrary contents.
   values=sheet.getRange(1,1,lastRow,lastCol).getValues();
  }else{
   // Explicit fake/legacy provider fallback, only for injection-based test adapters.
   values=sheet.getDataRange().getValues();
   if(values.length-1>MAX_SCAN_ROWS)throw new Error('SCAN_LIMIT_EXCEEDED');
  }
  if(!values.length)throw new Error('MISSING_HEADERS:'+name);
  const headers=values[0].map(String);
  if(headers.length!==expected.length||headers.some((h,i)=>h!==expected[i]))
   throw new Error('SCHEMA_MISMATCH:'+name);
  const records=values.slice(1).map((cells,i)=>({row:i+2,data:Object.fromEntries(headers.map((h,j)=>[
   h,cells[j] instanceof Date?cells[j].toISOString():cells[j]
  ]))})).filter(x=>Object.values(x.data).some(v=>v!==''&&v!==null));
  const result={sheet,headers,records};
  snapshot.set(name,result);
  return result;
 }
 function match(record,filter){return Object.entries(filter||{}).every(([k,v])=>record[k]===v);}
 function records(name,filter){return table(name).records.filter(x=>match(x.data,filter));}
 function one(name,filter){
  const hits=records(name,filter);
  if(hits.length>1)throw new Error('DUPLICATE_KEY');
  return hits.length?{...hits[0].data}:null;
 }
 function list(name,filter={},limit=5000){
  if(!Number.isSafeInteger(limit)||limit<1||limit>5000)throw new Error('INVALID_LIMIT');
  return records(name,filter).slice(0,limit).map(x=>({...x.data}));
 }
 function listNewest(name,filter={},limit=5000){
  if(!Number.isSafeInteger(limit)||limit<1||limit>5000)throw new Error('INVALID_LIMIT');
  return records(name,filter).slice(-limit).map(x=>({...x.data}));
 }
 function literalCell(value){
  return typeof value==='string'&&/^[\s]*[=+@-]/.test(value)?"'"+value:value;
 }
 function invalidate(name){snapshot.delete(name);}
 function insert(name,data){
  const t=table(name);
  for(const c of DATABASE_SCHEMA.tables[name].columns)
   if(c.required&&(data[c.name]===undefined||data[c.name]===''))throw new Error('REQUIRED_FIELD:'+c.name);
  const key=DATABASE_SCHEMA.tables[name].columns.find(c=>c.key==='primary')?.name;
  if(key&&records(name,{[key]:data[key]}).length)throw new Error('DUPLICATE_KEY');
  const values=t.headers.map(h=>literalCell(data[h]===undefined?'':data[h]));
  t.sheet.appendRow(values);
  invalidate(name);
  return {...data};
 }
 function update(name,filter,patch){
  const t=table(name),hits=t.records.filter(x=>match(x.data,filter));
  if(hits.length!==1)throw new Error(hits.length?'DUPLICATE_KEY':'NOT_FOUND');
  if(!patch||Object.keys(patch).some(k=>!t.headers.includes(k)))throw new Error('INVALID_PATCH');
  const next={...hits[0].data,...patch};
  t.sheet.getRange(hits[0].row,1,1,t.headers.length).setValues([t.headers.map(h=>literalCell(next[h]===undefined?'':next[h]))]);
  invalidate(name);
  return next;
 }
 function remove(name,filter){
  const t=table(name),hits=t.records.filter(x=>match(x.data,filter));
  if(hits.length!==1)throw new Error(hits.length?'DUPLICATE_KEY':'NOT_FOUND');
  t.sheet.deleteRow(hits[0].row);
  invalidate(name);
  return true;
 }
 function withLock(fn){
  if(locked)return fn();
  const lock=lockService.getScriptLock();
  if(!lock.tryLock(15000))throw new Error('BUSY');
  locked=true;
  snapshot.clear(); // Must re-read after acquiring lock; pre-lock caches are stale.
  try{return fn();}finally{
   try{if(typeof spreadsheetApp.flush==='function')spreadsheetApp.flush();}
   finally{snapshot.clear();locked=false;lock.releaseLock();}
  }
 }
 return Object.freeze({one,list,listNewest,insert,update,remove,withLock,sequence:fn=>fn()});
}
