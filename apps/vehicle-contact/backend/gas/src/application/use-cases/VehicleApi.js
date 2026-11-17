import {vehicleBusinessKey,validateFivePhotos,assertVehicleTransition,assertSingleActiveQr,canDeleteVehicle} from '../../domain/policies/VehicleLifecycle.js';
const rules={
 'registrations.submit':{permission:null},
 'registrations.review':{permission:'vehicle.registration.approve'},
 'vehicles.lookup':{permission:'vehicle.lookup'},
 'vehicles.detail':{permission:'vehicle.lookup'},
 'vehicles.cancel':{permission:'vehicle.update'},
 'qr.resolve':{permission:'vehicle.lookup'},
 'qr.revoke':{permission:'qr.manage'},
 'retention.approve':{permission:'retention.delete.approve'},
 'registrations.listPending':{permission:'vehicle.registration.approve'},
 'registrations.detail':{permission:'vehicle.registration.approve'},
 'vehicles.history':{permission:'vehicle.history.read'},
 'vehicles.update':{permission:'vehicle.update'},
 'contacts.read':{permission:'vehicle.contact.read'},
 'contacts.update':{permission:'vehicle.update'},
 'changes.listPending':{permission:'vehicle.change.approve'},
 'changes.review':{permission:'vehicle.change.approve'},
 'qr.issue':{permission:'qr.manage'},
 'qr.replace':{permission:'qr.manage'},
 'photos.list':{permission:'vehicle.photos.read'},
 'photos.replace':{permission:'vehicle.update'},
 'retention.listDue':{permission:'retention.read'},
 'retention.jobStatus':{permission:'retention.read'},
 'audit.query':{permission:'audit.read'},
 'audit.export':{permission:'audit.read'}
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
 case 'registrations.listPending':return db.listPendingRegistrations(p,context);
 case 'registrations.detail':return db.getRegistration(mustString(p.requestId,'requestId'),context);
 case 'registrations.review':{
   mustString(p.requestId,'requestId');
   if(!['APPROVE','REJECT'].includes(p.decision))throw new Error('INVALID_DECISION');
   return db.reviewRegistrationAtomic(p,context);
 }
 case 'vehicles.lookup':return db.lookupByBusinessKey(vehicleBusinessKey(p.plate,p.province),context);
 case 'vehicles.detail':return db.getVehicle(mustString(p.vehicleId,'vehicleId'),context);
 case 'vehicles.history':return db.getVehicleHistory(mustString(p.vehicleId,'vehicleId'),context);
 case 'vehicles.update':return db.updateVehicleAtomic({...p,vehicleId:mustString(p.vehicleId,'vehicleId')},context);
 case 'contacts.read':return db.getVehicleContact(mustString(p.vehicleId,'vehicleId'),context);
 case 'contacts.update':return db.updateVehicleContactAtomic({...p,vehicleId:mustString(p.vehicleId,'vehicleId')},context);
 case 'changes.listPending':return db.listPendingChanges(p,context);
 case 'changes.review':return db.reviewChangeAtomic({...p,requestId:mustString(p.requestId,'requestId')},context);
 case 'vehicles.cancel':return db.cancelVehicleAtomic(mustString(p.vehicleId,'vehicleId'),context);
 case 'qr.resolve':return db.resolveQr(mustString(p.token,'token'),context);
 case 'qr.issue':return db.issueQrAtomic(mustString(p.vehicleId,'vehicleId'),context);
 case 'qr.replace':return db.replaceQrAtomic(mustString(p.vehicleId,'vehicleId'),context);
 case 'photos.list':return db.listPhotos(mustString(p.vehicleId,'vehicleId'),context);
 case 'photos.replace':return db.replacePhotoAtomic({...p,vehicleId:mustString(p.vehicleId,'vehicleId')},context);
 case 'qr.revoke':return db.revokeQrAtomic(mustString(p.vehicleId,'vehicleId'),context);
 case 'retention.listDue':return db.listDueRetention(p,context);
 case 'retention.jobStatus':return db.getRetentionJob(mustString(p.jobId,'jobId'),context);
 case 'audit.query':return db.queryAudit(p,context);
 case 'audit.export':return db.exportAudit(p,context);
 case 'retention.approve':return db.approveRetentionAtomic(mustString(p.jobId,'jobId'),context);
 default:throw new Error('UNKNOWN_OPERATION');
 }
}
