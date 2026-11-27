import {validateOperationPayload,DTO_OPERATIONS} from '../dto/OperationPayloadValidator.js';
import {validateApiRequest} from '../dto/RequestValidator.js';
import {apiSuccess,apiFailure} from '../responses/ResponseFactory.js';
import {requestIdOf} from '../routes/Router.js';
import {createIdentityOperations} from '../../application/use-cases/IdentityOperations.js';
import {createAdministrationOperations} from '../../application/use-cases/AdministrationOperations.js';
import {createVehicleOperations} from '../../application/use-cases/VehicleOperations.js';
import {createMediaRetentionOperations} from '../../application/use-cases/MediaRetentionOperations.js';
import {createReferenceOperations} from '../../application/use-cases/ReferenceOperations.js';
import {stickerSettings,withStickerCategories} from '../../application/use-cases/StickerCategoryOperations.js';
import {createSettingsOperations,numericSettings,photoPolicySettings} from '../../application/settings/SettingsRegistry.js';
import {createLogManager} from '../../application/logging/LogManager.js';
import {createSystemResetOperations} from '../../application/use-cases/SystemResetOperations.js';
import {createLogPolicyReader,logPolicySettings,withLogPolicyStore} from '../../application/use-cases/LogPolicyOperations.js';
import {createVehicleListOperations,withPrintStateStore} from '../../application/use-cases/VehicleListOperations.js';
const permissions={
 'system.config.get':'system.settings.read','system.config.update':'system.settings.manage','system.reset.preview':'system.reset','system.reset.execute':'system.reset',
 'auth.changePassword':'session.authenticated','auth.logout':'session.authenticated','auth.session':'session.authenticated','auth.linkGoogle':'session.authenticated',
 'users.create':'users.manage','users.list':'users.manage','users.update':'users.manage','users.suspend':'users.manage','users.reactivate':'users.manage','users.resetPassword':'users.manage','users.assignRoles':'users.manage',
 'organizations.list':'organizations.read','organizations.create':'organizations.manage','organizations.update':'organizations.manage','organizations.disable':'organizations.manage','organizations.enable':'organizations.manage',
 'campaigns.create':'campaigns.manage','campaigns.list':'campaigns.manage','campaigns.revoke':'campaigns.manage',
 'references.registration':'vehicle.registration.approve',
 'registrations.listPending':'vehicle.registration.approve','registrations.detail':'vehicle.registration.approve','registrations.review':'vehicle.registration.approve','registrations.photo':'vehicle.registration.approve',
 'vehicles.lookup':'vehicle.lookup','vehicles.detail':'vehicle.lookup','vehicles.update':'vehicle.update','vehicles.cancel':'vehicle.update','vehicles.history':'vehicle.history.read','vehicles.listMine':'vehicle.own.read','vehicles.list':'vehicle.list',
 'contacts.read':'vehicle.contact.read','contacts.update':'vehicle.update',
 'changes.submit':'vehicle.change.submit','changes.listPending':'vehicle.change.approve','changes.review':'vehicle.change.approve','changes.listMine':'vehicle.own.read',
 'qr.resolve':'vehicle.lookup','qr.issue':'qr.manage','qr.revoke':'qr.manage','qr.replace':'qr.manage','qr.history':'qr.manage','qr.export':'qr.manage','qr.markPrinted':'qr.manage',
 'photos.list':'vehicle.photos.read','vehicles.photo':'vehicle.photos.read','photos.replace':'vehicle.update',
 'retention.listDue':'retention.read','retention.listExecutable':'retention.worker','retention.approve':'retention.delete.approve','retention.execute':'retention.worker','retention.jobStatus':'retention.read',
 'audit.query':'audit.read','audit.export':'audit.read'
};
const publicOps=new Set(['auth.login','auth.googleLogin','campaigns.validate','registrations.submit','photos.upload']);
export const OPERATION_PERMISSIONS=Object.freeze({...permissions});
export const PUBLIC_OPERATIONS=Object.freeze([...publicOps]);
const safeErrors=new Set([
 'BAD_REQUEST','NOT_FOUND','INVALID_REQUEST','FORBIDDEN','UNAUTHENTICATED','SESSION_EXPIRED','SESSION_IDLE_EXPIRED',
 'PASSWORD_CHANGE_REQUIRED','LOGIN_RATE_LIMIT','INVALID_CREDENTIALS','INVALID_GOOGLE_TOKEN','IDENTITY_ALREADY_LINKED',
 'INVALID_PASSWORD','DUPLICATE_USERNAME','INVALID_ROLES','DUPLICATE_KEY','DUPLICATE_VEHICLE','DUPLICATE_ACTIVE_VEHICLE',
 'INVALID_CAMPAIGN','CAMPAIGN_INVALID','FIVE_PHOTOS_REQUIRED','PLATE_PHOTO_NOT_VERIFIED','PHOTO_SLOT_INVARIANT','IDEMPOTENCY_CONFLICT','OWNER_NOT_FOUND','PHOTO_NOT_STAGED','INVALID_SLOT','INVALID_MEDIA',
 'INVALID_MIME','PHOTO_UPLOAD_LIMIT','INVALID_IMAGE_SIZE','IMAGE_SIGNATURE_MISMATCH','PHOTO_NOT_FOUND','VEHICLE_NOT_ACTIVE','VERSION_CONFLICT',
 'CONTACT_NOT_FOUND','PRIMARY_CONTACT_INVARIANT','INVALID_REQUEST_STATE','INVALID_DECISION','OWNERSHIP_NOT_VERIFIED',
 'INVALID_QR','QR_REVOKED','INVALID_STICKER_CATEGORY','RESET_CONFIRMATION_INVALID','RESET_PLAN_STALE','INVALID_STICKER_CATEGORIES','INVALID_LOG_POLICY','LOG_REQUIRED','PHOTO_TOO_LARGE','INVALID_PHOTO_POLICY','STICKER_CATEGORY_REQUIRED','STICKER_CATEGORY_IN_USE','INVALID_QR_REASON','INVALID_VEHICLE_IDS','QR_ALREADY_ACTIVE','MULTIPLE_ACTIVE_QR','RETENTION_NOT_APPROVABLE','RETENTION_EXECUTION_DISABLED',
 'DELETION_NOT_AUTHORIZED','DELETION_RETRY_REQUIRED','BUSY','CAMPAIGN_BUSY','SCHEMA_MISMATCH','MISSING_TABLE','IDLE_POLICY_NOT_CONFIGURED',
 'INVALID_LIMIT','INVALID_PAGINATION','NO_CHANGES','ORGANIZATION_INACTIVE','PARENT_NOT_FOUND','INVALID_ORG_TYPE','INVALID_ORG_PARENT',
 'SELF_DEMOTION_DENIED','SELF_ROLE_EXPANSION_DENIED','SELF_SUSPEND_DENIED','RETENTION_POLICY_NOT_CONFIGURED','OPERATION_DISABLED','OPERATION_RECOVERY_REQUIRED',
 'REFERENCE_DATA_INVALID','REFERENCE_DATA_BOUNDS','REFERENCE_VERSION_STALE','INVALID_REFERENCE_VALUE'
]);
// VC-ADR-046: shared with the Node core facade (one source) — how an operation's session is checked, and how any error
// becomes the public code (never an internal message).
export const AUTH_OPTIONS=Object.freeze({
 allowPasswordChange:Object.freeze(['auth.changePassword','auth.logout','auth.session']),
 fresh:Object.freeze(['auth.changePassword','auth.linkGoogle','system.reset.execute']) // these verify the stored password hash
});
export const authOptionsFor=op=>({allowPasswordChange:AUTH_OPTIONS.allowPasswordChange.includes(op),fresh:AUTH_OPTIONS.fresh.includes(op)});
export function publicErrorCode(e){
 const raw=String(e&&e.message||'OPERATION_FAILED');
 return safeErrors.has(raw)?raw:raw.startsWith('INVALID_')?'INVALID_REQUEST':raw.startsWith('SCHEMA_MISMATCH:')?'SCHEMA_MISMATCH':'OPERATION_FAILED';
}
export function createOperationController({store:rawStore,security,sessions,drivePhotos,allowDestructiveRetention=false,allowSystemReset=false,referenceMemo=null,logPolicyMemo=null}) {
 // VC-ADR-040: every operation writes through the log-policy store (switched-off logs are not written; kept ones expire)
 const policy=createLogPolicyReader(rawStore,logPolicyMemo);
 // VC-ADR-042: a new ACTIVE QR puts the vehicle back to NOT_PRINTED on every write path
 const logs=createLogManager({policy,now:()=>security.now()}); // VC-ADR-043: log kinds + sinks (Firestore)
 const store=withPrintStateStore(withLogPolicyStore(rawStore,{policy,now:()=>security.now(),manager:logs}));
 const admin=createAdministrationOperations({store,security});
 const references=createReferenceOperations({store,security,memo:referenceMemo});
 // system.config.get/update: one settings registry (numeric settings, person type / sticker colour, log policy)
 const settings=createSettingsOperations({store,security,entries:[numericSettings(),stickerSettings(),logPolicySettings({policy,memo:logPolicyMemo,manager:logs}),photoPolicySettings()]});
 const handlers=withStickerCategories({
  ...createIdentityOperations({store,security,sessions}),...admin,...settings,'references.registration':references['references.registration'],
  ...createVehicleOperations({store,security,campaigns:admin,references,drivePhotos}),
  ...createVehicleListOperations({store,security}),
  ...createMediaRetentionOperations({store,security,drivePhotos,campaigns:admin,allowDestructiveRetention}),
  ...createSystemResetOperations({store,security,drivePhotos,enabled:allowSystemReset})
 },{store,security});
 delete handlers.getCampaign;
 const entries=Object.keys(handlers);
 // every handler has a DTO and vice versa (system.health is answered by the Router; the inventory = DTOs + health)
 if(entries.length!==DTO_OPERATIONS.length||entries.some(op=>!DTO_OPERATIONS.includes(op))
  ||entries.some(op=>!publicOps.has(op)&&!permissions[op]))
  throw new Error('INCOMPLETE_API_DISPATCH');
 function dispatch(request){
  const requestId=requestIdOf(request);
  try{
   validateApiRequest(request);
   const op=request.group+'.'+request.action;
   if(!Object.prototype.hasOwnProperty.call(handlers,op))return apiFailure('NOT_FOUND','Unavailable operation',requestId);
   validateOperationPayload(op,request.payload||{});
   const principal=publicOps.has(op)?null:sessions.authorize(request.sessionToken,permissions[op],authOptionsFor(op));
   const result=handlers[op](request.payload||{},principal);
   return apiSuccess(result,requestId);
  }catch(e){
   return apiFailure(publicErrorCode(e),'Request could not be completed',requestId);
  }
 }
 return Object.freeze({dispatch,operations:Object.freeze(entries)});
}
