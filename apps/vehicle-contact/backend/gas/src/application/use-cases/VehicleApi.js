import {vehicleBusinessKey,validateFivePhotos,assertVehicleTransition,assertSingleActiveQr,canDeleteVehicle} from '../../domain/policies/VehicleLifecycle.js';
const rules={
 'registrations.submit':{permission:null},
 'registrations.review':{permission:'vehicle.registration.approve'},
 'vehicles.lookup':{permission:'vehicle.lookup'},
 'vehicles.detail':{permission:'vehicle.lookup'},
 'vehicles.cancel':{permission:'vehicle.update'},
 'qr.resolve':{permission:'vehicle.lookup'},
 'qr.revoke':{permission:'qr.manage'},
 'retention.approve':{permission:'retention.delete.approve'}
};
export const API_OPERATIONS=Object.freeze(Object.keys(rules));
function mustString(v,key){if(typeof v!=='string'||!v.trim()||v.length>128)throw new Error('INVALID_'+key.toUpperCase());return v.trim();}
function requireRole(principal,permission){
 if(!principal||!principal.userId||!Array.isArray(principal.permissions)||!principal.permissions.includes(permission))throw new Error('FORBIDDEN');
}
export function executeVehicleApi(operation,payload,context){
 if(!Object.prototype.hasOwnProperty.call(rules,operation))throw new Error('UNKNOWN_OPERATION');
 if(!context||!context.trustedBoundary||!context.repository)throw new Error('SECURE_BOUNDARY_UNAVAILABLE');
 const {repository:db,principal}=context;
 const rule=rules[operation];if(rule.permission)requireRole(principal,rule.permission);
 const p=payload||{};
 switch(operation){
 case 'registrations.submit': {
   if(!context.campaignVerified)throw new Error('CAMPAIGN_NOT_VERIFIED');
   const key=vehicleBusinessKey(p.plate,p.province);
   if(!validateFivePhotos(p.photos))throw new Error('FIVE_PHOTOS_REQUIRED');
   mustString(p.contactName,'contactName');mustString(p.contactPhone,'contactPhone');
   for(const field of ['vehicleType','brand','model','color','plateType','organizationId','relationship'])mustString(p[field],field);
   // Adapter MUST atomically reserve campaign quota, check duplicate, write pending record, and journal operation.
   return db.submitRegistrationAtomic({...p,businessKey:key},context);
 }
 case 'registrations.review':{
   mustString(p.requestId,'requestId');
   if(!['APPROVE','REJECT'].includes(p.decision))throw new Error('INVALID_DECISION');
   return db.reviewRegistrationAtomic(p,context);
 }
 case 'vehicles.lookup':return db.lookupByBusinessKey(vehicleBusinessKey(p.plate,p.province),context);
 case 'vehicles.detail':return db.getVehicle(mustString(p.vehicleId,'vehicleId'),context);
 case 'vehicles.cancel':return db.cancelVehicleAtomic(mustString(p.vehicleId,'vehicleId'),context);
 case 'qr.resolve':return db.resolveQr(mustString(p.token,'token'),context);
 case 'qr.revoke':return db.revokeQrAtomic(mustString(p.vehicleId,'vehicleId'),context);
 case 'retention.approve':return db.approveRetentionAtomic(mustString(p.jobId,'jobId'),context);
 default:throw new Error('UNKNOWN_OPERATION');
 }
}
