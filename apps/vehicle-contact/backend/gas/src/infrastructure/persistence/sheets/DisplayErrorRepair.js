import {DATABASE_SCHEMA} from '../../../domain/ports/SchemaRepository.js';

const SPREADSHEET_ERRORS=new Set(['#VALUE!','#REF!','#DIV/0!','#N/A','#NAME?','#NUM!','#NULL!','#ERROR!']);
const isError=value=>SPREADSHEET_ERRORS.has(String(value));
const columnName=index=>{let n=index+1,s='';while(n){s=String.fromCharCode(65+(n-1)%26)+s;n=Math.floor((n-1)/26);}return s;};

function readGrid(book,name){
 const def=DATABASE_SCHEMA.tables[name],sheet=book.getSheetByName(name);
 if(!sheet)return {skipped:'MISSING_TABLE'};
 const lastRow=sheet.getLastRow(),lastCol=sheet.getLastColumn(),columns=def.columns;
 if(lastRow<2)return {sheet,columns,dataRows:0,empty:true};
 if(lastCol<columns.length)return {skipped:'SCHEMA_MISMATCH',lastCol,expected:columns.length};
 const fullRange=sheet.getRange(1,1,lastRow,lastCol),fullDisplay=fullRange.getDisplayValues();
 const headers=fullDisplay[0].slice(0,columns.length).map(String);
 const trailingEmpty=fullDisplay.every(row=>row.slice(columns.length).every(value=>value===''));
 if(headers.some((h,i)=>h!==columns[i].name)||!trailingEmpty)
  return {skipped:'SCHEMA_MISMATCH',lastCol,expected:columns.length};
 const range=lastCol===columns.length?fullRange:sheet.getRange(1,1,lastRow,columns.length);
 return {sheet,range,columns,display:fullDisplay.map(row=>row.slice(0,columns.length)),
  trailingEmptyColumns:lastCol-columns.length,dataRows:lastRow-1};
}

function approvedApplications(book){
 const grid=readGrid(book,'vc_registration_requests');
 if(grid.skipped||grid.empty)return new Map();
 const values=grid.range.getValues(),index=Object.fromEntries(grid.columns.map((c,i)=>[c.name,i]));
 const result=new Map();
 for(let r=1;r<values.length;r++){
  const row=values[r];
  if(row[index.status]!=='APPROVED')continue;
  const vehicleId=String(row[index.vehicle_id]);
  let application;try{application=JSON.parse(row[index.application_json]);}catch{continue;}
  const source={plate:String(application.plate_normalized||''),province:String(application.province_code||'')};
  if(result.has(vehicleId))result.set(vehicleId,null);else result.set(vehicleId,source);
 }
 return result;
}

// Editor-only display audit. The sole automatic value repair is a legacy numeric
// vc_vehicles.province_code restored from its approved registration snapshot.
export function repairDisplayErrors({spreadsheetApp,spreadsheetId,lockService}){
 if(!spreadsheetApp||!spreadsheetId||!lockService)throw new Error('STORAGE_NOT_CONFIGURED');
 const lock=lockService.getScriptLock();
 if(!lock.tryLock(15000))throw new Error('BUSY');
 try{
  const book=spreadsheetApp.openById(spreadsheetId),grids=new Map(),sheets=[];
  let totalErrorsBefore=0;
  for(const name of Object.keys(DATABASE_SCHEMA.tables)){
   const grid=readGrid(book,name);
   if(grid.skipped){sheets.push({name,skipped:grid.skipped,lastCol:grid.lastCol,expected:grid.expected});continue;}
   grids.set(name,grid);
   const errors=[];
   if(!grid.empty)for(let r=1;r<grid.display.length;r++)for(let c=0;c<grid.columns.length;c++)
    if(isError(grid.display[r][c]))errors.push({cell:columnName(c)+(r+1),column:grid.columns[c].name});
   totalErrorsBefore+=errors.length;
   sheets.push({name,dataRows:grid.dataRows,trailingEmptyColumns:grid.trailingEmptyColumns||0,
    errorsBefore:errors.length,errorCells:errors.slice(0,100),repaired:0});
  }
  const vehicles=grids.get('vc_vehicles'),vehicleResult=sheets.find(x=>x.name==='vc_vehicles');
  const skipped={FORMULA_ERROR:0,SOURCE_NOT_FOUND:0,SOURCE_MISMATCH:0};
  if(vehicles&&!vehicles.empty&&vehicleResult.errorsBefore){
   const index=Object.fromEntries(vehicles.columns.map((c,i)=>[c.name,i])),provinceColumn=index.province_code;
   const values=vehicles.range.getValues(),formulas=vehicles.range.getFormulas(),sources=approvedApplications(book);
   for(let r=1;r<vehicles.display.length;r++){
    if(!isError(vehicles.display[r][provinceColumn]))continue;
    if(formulas[r][provinceColumn]){skipped.FORMULA_ERROR++;continue;}
    const source=sources.get(String(values[r][index.vehicle_id]));
    if(!source||!/^[A-Za-z0-9_-]{1,32}$/.test(source.province)){skipped.SOURCE_NOT_FOUND++;continue;}
    if(source.plate!==String(values[r][index.plate_normalized])){skipped.SOURCE_MISMATCH++;continue;}
    vehicles.sheet.getRange(r+1,provinceColumn+1).setNumberFormat('@').setValue(source.province);
    vehicles.display[r][provinceColumn]=source.province;
    vehicleResult.repaired++;
   }
  }
  let totalErrorsAfter=0;
  for(const result of sheets){
   const grid=grids.get(result.name);
   if(!grid||grid.empty)continue;
   let remaining=0;
   for(let r=1;r<grid.display.length;r++)for(const value of grid.display[r])if(isError(value))remaining++;
   result.errorsAfter=remaining;totalErrorsAfter+=remaining;
  }
  const incompleteSheets=sheets.filter(s=>s.skipped);
  return {status:incompleteSheets.length?'AUDIT_INCOMPLETE':totalErrorsAfter?'ERROR_VALUES_REMAIN':'OK',
   auditedSheets:grids.size,incompleteSheets,totalErrorsBefore,totalErrorsAfter,
   totalRepaired:sheets.reduce((n,s)=>n+(s.repaired||0),0),repairSkipped:skipped,
   writesLimitedTo:'vc_vehicles.province_code',sheets};
 }finally{lock.releaseLock();}
}
