import test from 'node:test';
import assert from 'node:assert/strict';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';
import {repairDisplayErrors} from '../src/infrastructure/persistence/sheets/DisplayErrorRepair.js';

function fixture(name,records,{displayOverrides={},formulaOverrides={},trailingEmptyColumns=0}={}){
 const columns=DATABASE_SCHEMA.tables[name].columns.map(c=>c.name),width=columns.length+trailingEmptyColumns;
 const values=[columns,...records.map(row=>columns.map(c=>row[c]??''))].map(row=>row.concat(Array(trailingEmptyColumns).fill('')));
 const display=values.map((row,r)=>row.map((v,c)=>displayOverrides[r+','+c]??String(v)));
 const formulas=values.map((row,r)=>row.map((v,c)=>formulaOverrides[r+','+c]??''));
 const writes=[];
 const sheet={
  getLastRow(){return values.length;},getLastColumn(){return width;},
  getRange(r,c,h,w){
   if(h===values.length&&(w===width||w===columns.length))return{
    getDisplayValues(){return display.map(row=>row.slice(0,w));},
    getValues(){return values.map(row=>row.slice(0,w));},
    getFormulas(){return formulas.map(row=>row.slice(0,w));}
   };
   assert.equal(h,undefined);assert.equal(w,undefined);
   return{
    setNumberFormat(format){writes.push({r,c,format});return this;},
    setValue(value){writes.push({r,c,value});values[r-1][c-1]=value;display[r-1][c-1]=String(value);return this;}
   };
  }
 };
 return {sheet,values,display,writes};
}
function run(book){
 const lockService={getScriptLock(){return{tryLock(){return true;},releaseLock(){}}}};
 return repairDisplayErrors({spreadsheetApp:{openById(){return book;}},spreadsheetId:'x',lockService});
}
function book(present){
 return {getSheetByName(name){return present[name]||{getLastRow(){return 1;},getLastColumn(){return 0;}};}};
}
const vehicle=(id,plate,province)=>({vehicle_id:id,plate_normalized:plate,province_code:province,status:'ACTIVE'});
const registration=(id,plate,province,status='APPROVED')=>({vehicle_id:id,status,application_json:JSON.stringify({plate_normalized:plate,province_code:province})});

test('restores a numeric-backed #VALUE! province from its approved snapshot and is idempotent',()=>{
 const vehicles=fixture('vc_vehicles',[vehicle('v1','ฑฆ9902',50),vehicle('v2','TST1','TH-10')],{
  displayOverrides:{'1,2':'#VALUE!'},trailingEmptyColumns:10});
 const requests=fixture('vc_registration_requests',[registration('v1','ฑฆ9902','50')]);
 const first=run(book({vc_vehicles:vehicles.sheet,vc_registration_requests:requests.sheet}));
 assert.equal(first.status,'OK');assert.equal(first.totalErrorsBefore,1);assert.equal(first.totalErrorsAfter,0);
 assert.equal(first.totalRepaired,1);assert.equal(first.writesLimitedTo,'vc_vehicles.province_code');
 assert.deepEqual(vehicles.writes,[{r:2,c:3,format:'@'},{r:2,c:3,value:'50'}]);
 assert.equal(vehicles.values[1][2],'50');assert.equal(vehicles.display[1][2],'50');
 const second=run(book({vc_vehicles:vehicles.sheet,vc_registration_requests:requests.sheet}));
 assert.equal(second.status,'OK');assert.equal(second.totalErrorsBefore,0);assert.equal(second.totalRepaired,0);
 assert.equal(vehicles.writes.length,2,'second pass performs no writes');
});

test('never overwrites a formula error or an unmatched source',()=>{
 const vehicles=fixture('vc_vehicles',[vehicle('v1','A',50),vehicle('v2','B',30)],{
  displayOverrides:{'1,2':'#VALUE!','2,2':'#VALUE!'},formulaOverrides:{'1,2':'=BAD()'}});
 const requests=fixture('vc_registration_requests',[registration('different','B','30')]);
 const result=run(book({vc_vehicles:vehicles.sheet,vc_registration_requests:requests.sheet}));
 assert.equal(result.status,'ERROR_VALUES_REMAIN');assert.equal(result.totalErrorsAfter,2);assert.equal(result.totalRepaired,0);
 assert.deepEqual(result.repairSkipped,{FORMULA_ERROR:1,SOURCE_NOT_FOUND:1,SOURCE_MISMATCH:0});
 assert.equal(vehicles.writes.length,0);
});

test('reports errors on every sheet without masking or rewriting unrelated cells',()=>{
 const vehicles=fixture('vc_vehicles',[vehicle('v1','A','TH-10')]);
 const settings=fixture('vc_settings',[{key:'x',value:'#REF!'}]);
 const result=run(book({vc_vehicles:vehicles.sheet,vc_settings:settings.sheet}));
 assert.equal(result.status,'ERROR_VALUES_REMAIN');assert.equal(result.totalErrorsBefore,1);assert.equal(result.totalErrorsAfter,1);
 assert.equal(result.sheets.find(x=>x.name==='vc_settings').errorCells[0].cell,'B2');
 assert.equal(settings.writes.length,0);assert.equal(result.totalRepaired,0);
});

test('schema drift makes the audit incomplete instead of reporting a false OK',()=>{
 const vehicles=fixture('vc_vehicles',[vehicle('v1','A','TH-10')]);
 vehicles.values[0][0]='';vehicles.display[0][0]='';
 const result=run(book({vc_vehicles:vehicles.sheet}));
 assert.equal(result.status,'AUDIT_INCOMPLETE');
 assert.equal(result.auditedSheets,Object.keys(DATABASE_SCHEMA.tables).length-1);
 assert.deepEqual(result.incompleteSheets,[{name:'vc_vehicles',skipped:'SCHEMA_MISMATCH',lastCol:16,expected:16}]);
 assert.equal(result.totalErrorsBefore,0);assert.equal(result.totalRepaired,0);
 assert.equal(vehicles.writes.length,0);
});
