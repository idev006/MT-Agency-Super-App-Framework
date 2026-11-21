import test from 'node:test';
import assert from 'node:assert/strict';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';
import {normalizeNumberFormats} from '../src/infrastructure/persistence/sheets/NumberFormatRepair.js';

const FORMAT_BY_TYPE={string:'@','datetime-iso8601':'@',integer:'General',boolean:'General'};

function fakeSheet(name,{rows,corrupt}){
 const cols=DATABASE_SCHEMA.tables[name].columns;
 const desired=cols.map(c=>FORMAT_BY_TYPE[c.type]||'@');
 const current=Array.from({length:rows-1},()=>desired.map((f,j)=>corrupt&&j===0?'@,@,@':f));
 let applied=null;
 return {
  getLastRow(){return rows;},
  getLastColumn(){return cols.length;},
  getRange(r,c,h,w){
   assert.equal(r,2);assert.equal(c,1);assert.equal(h,rows-1);assert.equal(w,cols.length);
   return {
    getNumberFormats(){return current.map(row=>row.slice());},
    setNumberFormats(m){
     assert.ok(Array.isArray(m)&&m.length===rows-1,'plural 2D matrix');
     m.forEach(row=>assert.equal(row.length,cols.length));
     applied=m;return this;
    },
    getValues(){throw new Error('repair must NOT read values');},
    setValues(){throw new Error('repair must NOT write values');}
   };
  },
  get applied(){return applied;}
 };
}

test('number-format repair reports per-sheet scope and re-applies formats without touching values',()=>{
 const sessions=fakeSheet('vc_sessions',{rows:5,corrupt:true});
 const vehicles=fakeSheet('vc_vehicles',{rows:4,corrupt:false});
 const book={getSheetByName(n){if(n==='vc_sessions')return sessions;if(n==='vc_vehicles')return vehicles;return null;}};
 const lockService={getScriptLock(){return{tryLock(){return true;},releaseLock(){}}}};
 const result=normalizeNumberFormats({spreadsheetApp:{openById(){return book;}},spreadsheetId:'x',lockService});
 assert.equal(result.status,'OK');
 assert.equal(result.valuesUntouched,true);
 const s=result.sheets.find(x=>x.name==='vc_sessions');
 const v=result.sheets.find(x=>x.name==='vc_vehicles');
 assert.equal(s.dataRows,4);
 assert.equal(s.mismatchedCellsBefore,4,'one corrupt column x 4 data rows');
 assert.equal(s.applied,true);
 assert.equal(v.mismatchedCellsBefore,0);
 assert.equal(v.applied,false,'conforming sheet is not rewritten');
 assert.ok(sessions.applied,'setNumberFormats called on corrupt sheet');
 assert.equal(sessions.applied[0][0],'@','corrected to plain text');
 assert.equal(vehicles.applied,null,'no format write on conforming sheet');
 assert.ok(result.sheets.some(x=>x.skipped==='MISSING_TABLE'),'absent tables reported, not fatal');
 assert.equal(result.totalApplied,1);
});

test('number-format repair refuses schema-mismatched sheets instead of mis-formatting',()=>{
 const cols=DATABASE_SCHEMA.tables.vc_sessions.columns.length;
 const bad={getLastRow(){return 3;},getLastColumn(){return cols+1;},getRange(){throw new Error('must not format mismatched sheet');}};
 const book={getSheetByName(n){return n==='vc_sessions'?bad:null;}};
 const lockService={getScriptLock(){return{tryLock(){return true;},releaseLock(){}}}};
 const r=normalizeNumberFormats({spreadsheetApp:{openById(){return book;}},spreadsheetId:'x',lockService});
 const s=r.sheets.find(x=>x.name==='vc_sessions');
 assert.equal(s.skipped,'SCHEMA_MISMATCH');
 assert.equal(r.totalApplied,0);
});

test('numeric General-equivalent format (0.###############) is conforming, not a perpetual mismatch',()=>{
 const name='vc_sessions',cols=DATABASE_SCHEMA.tables[name].columns,rows=6;
 // Sheets reports numeric General cells as '0.###############'; text cells as '@'.
 const current=Array.from({length:rows-1},()=>cols.map(c=>(c.type==='integer'||c.type==='boolean')?'0.###############':'@'));
 let applied=null;
 const sheet={getLastRow(){return rows;},getLastColumn(){return cols.length;},
  getRange(r,c,h,w){assert.equal(r,2);assert.equal(h,rows-1);assert.equal(w,cols.length);return{
   getNumberFormats(){return current.map(row=>row.slice());},
   setNumberFormats(m){applied=m;return this;},
   getValues(){throw new Error('repair must NOT read values');},
   setValues(){throw new Error('repair must NOT write values');}};}};
 const book={getSheetByName(n){return n===name?sheet:null;}};
 const lockService={getScriptLock(){return{tryLock(){return true;},releaseLock(){}}}};
 const r=normalizeNumberFormats({spreadsheetApp:{openById(){return book;}},spreadsheetId:'x',lockService});
 const s=r.sheets.find(x=>x.name===name);
 assert.equal(s.mismatchedCellsBefore,0,'numeric General-equivalent must not be flagged');
 assert.equal(s.applied,false);
 assert.equal(applied,null,'no rewrite of already-correct numeric formats');
 assert.equal(r.totalApplied,0);
});