// Read-only Sheets adapter. Must only be invoked after server-side authorization.
// This is NOT a public endpoint and never trusts role fields from request payload.
import {normalizePlate} from '../../../domain/policies/VehicleLifecycle.js';
function table(book,name) {
 const sheet=book.getSheetByName(name);
 if(!sheet)throw new Error('MISSING_TABLE_'+name);
 const rows=sheet.getDataRange().getValues().map(row=>[...row]);
 if(!rows.length)return [];
 const headers=rows.shift().map(String);
 if(new Set(headers).size!==headers.length||headers.some(h=>!h))throw new Error('INVALID_TABLE_HEADERS');
 return rows.filter(row=>row.some(v=>v!==''&&v!==null)).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]])));
}
function active(row){return String(row.status).toUpperCase()==='ACTIVE';}
export function createSheetsVehicleReadRepository(spreadsheetApp,spreadsheetId,options={}) {
 if(!spreadsheetApp||typeof spreadsheetApp.openById!=='function'||!spreadsheetId)throw new Error('SHEETS_NOT_CONFIGURED');
 function book(){return spreadsheetApp.openById(spreadsheetId);}
 function audit(context,vehicleId,kind,result) {
   if(typeof options.audit!=='function')throw new Error('AUDIT_WRITER_REQUIRED');
   options.audit({actor_id:context.principal.userId,vehicle_id:vehicleId,lookup_source:kind,result,created_at:new Date().toISOString()});
 }
 function allowed(context){if(!context||context.trustedBoundary!==true||!context.principal||!context.principal.permissions.includes('vehicle.lookup'))throw new Error('FORBIDDEN');}
 function viewVehicle(b,vehicle,context,kind) {
  if(!vehicle||!active(vehicle))return null;
  const contacts=table(b,'vc_vehicle_contacts').filter(r=>r.vehicle_id===vehicle.vehicle_id&&active(r)&&String(r.is_primary).toLowerCase()==='true');
  const photos=table(b,'vc_vehicle_photos').filter(r=>r.vehicle_id===vehicle.vehicle_id&&active(r));
  audit(context,vehicle.vehicle_id,kind,'FOUND');
  const {phone_e164,...contactWithoutPhone}=contacts[0]||{};
  return {vehicle,contact:context.principal.permissions.includes('vehicle.contact.read')?contacts[0]||null:contactWithoutPhone,photos:context.principal.permissions.includes('vehicle.photos.read')?photos:[]};
 }
 return Object.freeze({
  lookupByBusinessKey(key,context) {
   allowed(context);
   const b=book(),vehicles=table(b,'vc_vehicles');
   const found=vehicles.find(r=>active(r)&&normalizePlate(String(r.plate_normalized))+'|'+String(r.province_code).toUpperCase()===key);
   if(!found){audit(context,'','PLATE','NOT_FOUND');return null;}
   return viewVehicle(b,found,context,'PLATE');
  },
  getVehicle(id,context){
   allowed(context);
   const b=book(),found=table(b,'vc_vehicles').find(r=>r.vehicle_id===id);
   if(!found){audit(context,'','DETAIL','NOT_FOUND');return null;}
   return viewVehicle(b,found,context,'DETAIL');
  }
 });
}
