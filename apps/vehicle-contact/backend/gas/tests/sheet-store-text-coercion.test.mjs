import assert from 'node:assert/strict';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';
import {createSheetStore} from '../src/infrastructure/persistence/sheets/SheetStore.js';

// Regression for the runtime Sheets coercion bug: numeric-looking STRING fields
// (e.g. province_code "10") were written via appendRow/setValues under General
// format, so real Sheets USER_ENTERED semantics turned them into numbers. The
// live vehicles.lookup filter uses strict === on province_code, so "10" (string)
// never matched 10 (number) and lookup returned null (LOOKUP_MISMATCH in E2E).
// This fake emulates USER_ENTERED per-cell so the bug is reproducible locally.
const headers=DATABASE_SCHEMA.tables.vc_vehicles.columns.map(c=>c.name);
const rows=[headers.slice()];
const cellFormat=new Map(); // "row:col" (1-based) -> number format string

function coerce(value,fmt){
 if(fmt==='@')return value; // text format preserves the literal string
 if(typeof value!=='string')return value;
 const t=value.trim();
 if(t!==''&&/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t))return Number(t);
 if(/^(true|false)$/i.test(t))return t.toLowerCase()==='true';
 return value;
}

const sheet={
 getLastRow(){return rows.length;},
 getLastColumn(){return headers.length;},
 getDataRange(){throw new Error('getDataRange must not be used with GAS Sheets');},
 getRange(r,c,h,w){
  assert.equal(c,1);assert.equal(w,headers.length);
  return {
   setNumberFormat(fmt){
    // Real GAS singular setNumberFormat accepts ONLY a String; passing an array
    // is the display-corruption bug (comma-joined custom format). Reject it.
    assert.equal(typeof fmt,'string','setNumberFormat(singular) must receive a String, not an array');
    for(let i=0;i<h;i++)for(let j=0;j<w;j++)cellFormat.set(`${r+i}:${c+j}`,fmt);
    return this;
   },
   setNumberFormats(fmt){
    assert.ok(Array.isArray(fmt),'setNumberFormats(plural) must receive a 2D array');
    for(let i=0;i<h;i++)for(let j=0;j<w;j++){
     cellFormat.set(`${r+i}:${c+j}`,fmt[i][j]);
    }
    return this;
   },
   getValues(){return rows.slice(r-1,r-1+h).map(a=>a.slice());},
   setValues(next){
    assert.equal(next.length,h);
    next.forEach((v,i)=>{
     assert.equal(v.length,w);
     rows[r-1+i]=v.map((cell,j)=>coerce(cell,cellFormat.get(`${r+i}:${c+j}`)));
    });
    return this;
   }
  };
 },
 appendRow(v){rows.push(v.map(cell=>coerce(cell,undefined)));},
 deleteRow(r){rows.splice(r-1,1);}
};
const spreadsheetApp={openById(){return{getSheetByName(name){return name==='vc_vehicles'?sheet:null}};},flush(){}};
const lockService={getScriptLock(){return{tryLock(){return true;},releaseLock(){}}}};
const store=createSheetStore({spreadsheetApp,spreadsheetId:'coercion-sheet',lockService});

store.insert('vc_vehicles',{vehicle_id:'v1',plate_normalized:'ฑฆ9901',province_code:'10',status:'ACTIVE',version:1});
const readBack=store.one('vc_vehicles',{vehicle_id:'v1'});
assert.equal(typeof readBack.province_code,'string','province_code must stay a STRING, not coerced to number');
assert.equal(readBack.province_code,'10');
assert.equal(readBack.version,1,'numeric version stays numeric');

// The live VehicleOperations.vehicleLookup filter (strict ===) must now match.
const matched=store.list('vc_vehicles').filter(v=>v.plate_normalized==='ฑฆ9901'&&v.province_code==='10'&&v.status==='ACTIVE');
assert.equal(matched.length,1,'strict === lookup finds the vehicle after text-preserving write');

// update must preserve text too (and not stringify a genuine number/boolean elsewhere).
store.update('vc_vehicles',{vehicle_id:'v1'},{province_code:'50'});
const updated=store.one('vc_vehicles',{vehicle_id:'v1'});
assert.equal(updated.province_code,'50','update preserves text province_code');
assert.equal(typeof updated.province_code,'string');
assert.equal(updated.version,1,'update keeps numeric version numeric');

console.log('SheetStore text-coercion regression: numeric province_code preserved as string, lookup matches PASSED');