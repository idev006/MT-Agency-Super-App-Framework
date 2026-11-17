import {validateOperationPayload,DTO_OPERATIONS} from '../dto/OperationPayloadValidator.js';
import {validateApiRequest} from '../dto/RequestValidator.js';
import {apiSuccess,apiFailure} from '../responses/ResponseFactory.js';
import {createIdentityOperations} from '../../application/use-cases/IdentityOperations.js';
import {createAdministrationOperations} from '../../application/use-cases/AdministrationOperations.js';
import {createVehicleOperations} from '../../application/use-cases/VehicleOperations.js';
import {createMediaRetentionOperations} from '../../application/use-cases/MediaRetentionOperations.js';
const permissions={
 'system.config.get':'system.settings.read','system.config.update':'system.settings.manage',
 'auth.changePassword':'session.authenticated','auth.logout':'session.authenticated','auth.session':'session.authenticated','auth.linkGoogle':'session.authenticated',
 'users.create':'users.manage','users.list':'users.manage','users.update':'users.manage','users.suspend':'users.manage','users.resetPassword':'users.manage','users.assignRoles':'users.manage',
 'organizations.list':'organizations.read','organizations.create':'organizations.manage','organizations.update':'organizations.manage','organizations.disable':'organizations.manage',
 'campaigns.create':'campaigns.manage','campaigns.list':'campaigns.manage','campaigns.revoke':'campaigns.manage',
 'registrations.listPending':'vehicle.registration.approve','registrations.detail':'vehicle.registration.approve','registrations.review':'vehicle.registration.approve',
 'vehicles.lookup':'vehicle.lookup','vehicles.detail':'vehicle.lookup','vehicles.update':'vehicle.update','vehicles.cancel':'vehicle.update','vehicles.history':'vehicle.history.read',
 'contacts.read':'vehicle.contact.read','contacts.update':'vehicle.update',
 'changes.submit':'vehicle.change.submit','changes.listPending':'vehicle.change.approve','changes.review':'vehicle.change.approve',
 'qr.resolve':'vehicle.lookup','qr.issue':'qr.manage','qr.revoke':'qr.manage','qr.replace':'qr.manage',
 'photos.list':'vehicle.photos.read','photos.replace':'vehicle.update',
 'retention.listDue':'retention.read','retention.approve':'retention.delete.approve','retention.execute':'retention.worker','retention.jobStatus':'retention.read',
 'audit.query':'audit.read','audit.export':'audit.read'
};
const publicOps=new Set(['auth.login','auth.googleLogin','campaigns.validate','registrations.submit','photos.upload']);
const safeErrors=new Set([
 'BAD_REQUEST','NOT_FOUND','INVALID_REQUEST','FORBIDDEN','UNAUTHENTICATED','SESSION_EXPIRED','SESSION_IDLE_EXPIRED',
 'PASSWORD_CHANGE_REQUIRED','LOGIN_RATE_LIMIT','INVALID_CREDENTIALS','INVALID_GOOGLE_TOKEN','IDENTITY_ALREADY_LINKED',
 'INVALID_PASSWORD','DUPLICATE_USERNAME','INVALID_ROLES','DUPLICATE_KEY','DUPLICATE_VEHICLE','DUPLICATE_ACTIVE_VEHICLE',
 'INVALID_CAMPAIGN','CAMPAIGN_INVALID','FIVE_PHOTOS_REQUIRED','PHOTO_NOT_STAGED','INVALID_SLOT','INVALID_MEDIA',
 'INVALID_MIME','PHOTO_UPLOAD_LIMIT','INVALID_IMAGE_SIZE','IMAGE_SIGNATURE_MISMATCH','VEHICLE_NOT_ACTIVE','VERSION_CONFLICT',
 'CONTACT_NOT_FOUND','PRIMARY_CONTACT_INVARIANT','INVALID_REQUEST_STATE','INVALID_DECISION','OWNERSHIP_NOT_VERIFIED',
 'INVALID_QR','QR_ALREADY_ACTIVE','MULTIPLE_ACTIVE_QR','RETENTION_NOT_APPROVABLE','RETENTION_EXECUTION_DISABLED',
 'DELETION_NOT_AUTHORIZED','DELETION_RETRY_REQUIRED','BUSY','SCHEMA_MISMATCH','MISSING_TABLE','IDLE_POLICY_NOT_CONFIGURED',
 'INVALID_LIMIT','NO_CHANGES','ORGANIZATION_INACTIVE','PARENT_NOT_FOUND','INVALID_ORG_TYPE','INVALID_ORG_PARENT',
 'SELF_DEMOTION_DENIED','SELF_SUSPEND_DENIED','RETENTION_POLICY_NOT_CONFIGURED','OPERATION_DISABLED'
]);
export function createOperationController({store,security,sessions,drivePhotos,allowDestructiveRetention=false}) {
 const admin=createAdministrationOperations({store,security});
 const handlers={
  ...createIdentityOperations({store,security,sessions}),...admin,
  ...createVehicleOperations({store,security,campaigns:admin}),
  ...createMediaRetentionOperations({store,security,drivePhotos,campaigns:admin,allowDestructiveRetention})
 };
 delete handlers.getCampaign;
 const entries=Object.keys(handlers);
 if(entries.length!==49||DTO_OPERATIONS.length!==49||entries.some(op=>!DTO_OPERATIONS.includes(op))
  ||entries.some(op=>!publicOps.has(op)&&!permissions[op]))
  throw new Error('INCOMPLETE_API_DISPATCH');
 function dispatch(request){
  const requestId=typeof request?.requestId==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(request.requestId)?request.requestId:null;
  try{
   validateApiRequest(request);
   const op=request.group+'.'+request.action;
   if(!Object.prototype.hasOwnProperty.call(handlers,op))return apiFailure('NOT_FOUND','Unavailable operation',requestId);
   validateOperationPayload(op,request.payload||{});
   const principal=publicOps.has(op)?null:sessions.authorize(request.sessionToken,permissions[op],{
    allowPasswordChange:['auth.changePassword','auth.logout','auth.session'].includes(op)
   });
   const result=handlers[op](request.payload||{},principal);
   return apiSuccess(result,requestId);
  }catch(e){
   const raw=String(e&&e.message||'OPERATION_FAILED');
   const code=safeErrors.has(raw)?raw:raw.startsWith('INVALID_')?'INVALID_REQUEST':raw.startsWith('SCHEMA_MISMATCH:')?'SCHEMA_MISMATCH':'OPERATION_FAILED';
   return apiFailure(code,'Request could not be completed',requestId);
  }
 }
 return Object.freeze({dispatch,operations:Object.freeze(entries)});
}
