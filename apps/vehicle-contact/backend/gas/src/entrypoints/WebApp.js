import {runFirestoreRestPoc} from '../infrastructure/persistence/firestore/FirestoreRestPoc.js';
import {createFirestoreCrud,runFirestoreCrudPoc} from '../infrastructure/persistence/firestore/FirestoreCrudPoc.js';
import {benchmarkStagingPasswordHash} from '../infrastructure/security/HashDiagnostics.js';
import {createOneTimeAdminPasswordReset} from '../infrastructure/security/AdminPasswordReset.js';
import {bootstrapStagingAdmin} from '../infrastructure/bootstrap/BootstrapAdmin.js';
import {createReferenceSeedInstaller} from '../infrastructure/reference/ReferenceSeedInstaller.js';
import {createRuntimeStore,runtimeProjectId} from '../composition/StoreSelector.js';
import {auditDrivePhotos} from '../infrastructure/media/DrivePhotoAudit.js';
import { createApplication } from "../composition/Container.js";
import { apiFailure } from "../api/responses/ResponseFactory.js";
function gasJson(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
export function doGet(e) {
  return gasJson(createApplication().dispatch({apiVersion:"v1",group:"system",action:"health",payload:{}},"GET"));
}
export function doPost(e) {
  if (!e || !e.postData || typeof e.postData.contents !== "string" || e.postData.contents.length>8*1024*1024)
    return gasJson(apiFailure("BAD_REQUEST","Missing or oversized request",null));
  try {
    const request=JSON.parse(e.postData.contents);
    const isMedia=request&&request.group==='photos'&&['upload','replace'].includes(request.action);
    if(!isMedia&&e.postData.contents.length>8192)return gasJson(apiFailure("BAD_REQUEST","Oversized request",null));
    return gasJson(createApplication().dispatch(request,"POST"));
  } catch (_) { return gasJson(apiFailure("BAD_REQUEST","Malformed request",null)); }
}
// Trusted Editor entrypoints only; NEVER expose these operations via doGet/doPost.
// S1 (VC-ADR-029): every admin tool runs on the runtime store (Firestore). Google Sheets is
// no longer read or written by any code path; the frozen Sheet data is kept, not deleted.
function editorStore() {
 const props=PropertiesService.getScriptProperties();
 return createRuntimeStore({props,services:{utilities:Utilities,urlFetchApp:UrlFetchApp},clock:()=>new Date().toISOString()});
}
function seedInstaller() {
 return createReferenceSeedInstaller({store:editorStore(),propertiesService:PropertiesService,utilities:Utilities});
}

// Trusted Editor-only catalog seed. Preview never writes; apply consumes an exact checksum approval.
export function previewVehicleReferenceSeedFromEditor() {
 const result=seedInstaller().preview();
 Logger.log(JSON.stringify(result));
 return result;
}
export function applyVehicleReferenceSeedFromEditor() {
 const result=seedInstaller().apply();
 Logger.log(JSON.stringify({status:result.status,seedVersion:result.seedVersion,rowCount:result.rowCount,
   checksum:result.checksum,mode:result.mode}));
 return result;
}
export function recoverVehicleReferenceSeedFromEditor() {
 const result=seedInstaller().recover();
 Logger.log(JSON.stringify({status:result.status,seedVersion:result.seedVersion,clearedCount:result.clearedCount}));
 return result;
}

// One-shot first-admin provisioning (refuses once any user exists). Never over HTTP.
export function bootstrapVehicleAdminFromEditor() {
 const result=bootstrapStagingAdmin({store:editorStore(),utilities:Utilities,propertiesService:PropertiesService});
 Logger.log(JSON.stringify(result));
 return result;
}

// Safe GAS Editor-only performance diagnostic. Never logs secret/password/hash or mutates users.
export function benchmarkVehiclePasswordHashFromEditor() {
 const result=benchmarkStagingPasswordHash({utilities:Utilities,propertiesService:PropertiesService});
 Logger.log(JSON.stringify(result));
 return result;
}

function adminReset() {
 return createOneTimeAdminPasswordReset({store:editorStore(),
  projectId:runtimeProjectId(PropertiesService.getScriptProperties()),
  utilities:Utilities,propertiesService:PropertiesService});
}
// Trusted GAS Editor ONLY. PREVIEW reads account/target policy; NEVER changes rows.
export function inspectVehicleAdminResetFromEditor() {
 const result=adminReset().inspect();
 Logger.log(JSON.stringify(result)); // No secret, hash or userId.
 return result;
}
// Explicitly approved one-time reset. This is NOT an HTTP operation.
export function resetVehicleAdminPasswordFromEditor() {
 const result=adminReset().apply();
 Logger.log(JSON.stringify(result)); // Sanitized counters and state ONLY.
 return result;
}

// POC #1 (F3a de-risk). Trusted GAS Editor ONLY; synthetic DEV Firestore proof of the
// production path the Node SDK probe did not cover: GAS V8 SA OAuth (RS256 JWT via
// Utilities.computeRsaSha256Signature) -> UrlFetchApp token exchange -> Firestore REST
// write/read-back/runQuery/transaction/delete. Requires an exact script-property approval
// gate plus the service-account key stored as a Script Property (secret, never in source).
// The private key and access token are NEVER logged. Not callable over doGet/doPost.
export function pocFirestoreRestFromEditor() {
 const props=PropertiesService.getScriptProperties();
 if(props.getProperty('VEHICLE_FIRESTORE_POC_APPROVED')!=='RUN_SYNTHETIC_FIRESTORE_POC')
  throw new Error('EXPLICIT_FIRESTORE_POC_APPROVAL_REQUIRED');
 const rawKey=props.getProperty('VEHICLE_FIRESTORE_SA_KEY');
 if(!rawKey)throw new Error('FIRESTORE_SA_KEY_NOT_CONFIGURED');
 const key=JSON.parse(rawKey);
 const result=runFirestoreRestPoc({utilities:Utilities,urlFetchApp:UrlFetchApp,
  clientEmail:key.client_email,privateKey:key.private_key,
  projectId:props.getProperty('VEHICLE_FIRESTORE_PROJECT_ID')||key.project_id,
  databaseId:props.getProperty('VEHICLE_FIRESTORE_DATABASE_ID')||'(default)'});
 Logger.log(JSON.stringify(result)); // Sanitized steps/counters ONLY; no key, token or PII.
 if(result.status!=='PASS')throw new Error('FIRESTORE_REST_POC_FAILED:'+(result.reason||result.status));
 return result;
}

// CRUD POC (owner ask 2026-11-23). Trusted GAS Editor ONLY: short readable Firestore CRUD
// (create/get/update/delete/list/query) on a synthetic collection, each step read-back
// verified, always cleaned up. Reuses the POC #1 approval gate + the runtime SA key Script
// Property (never logged). Not callable over doGet/doPost; touches no vc_* collection.
export function pocFirestoreCrudFromEditor() {
 const props=PropertiesService.getScriptProperties();
 if(props.getProperty('VEHICLE_FIRESTORE_POC_APPROVED')!=='RUN_SYNTHETIC_FIRESTORE_POC')
  throw new Error('EXPLICIT_FIRESTORE_POC_APPROVAL_REQUIRED');
 const rawKey=props.getProperty('VEHICLE_FIRESTORE_SA_KEY');
 if(!rawKey)throw new Error('FIRESTORE_SA_KEY_NOT_CONFIGURED');
 const crud=createFirestoreCrud({utilities:Utilities,urlFetchApp:UrlFetchApp,key:JSON.parse(rawKey),
  projectId:props.getProperty('VEHICLE_FIRESTORE_PROJECT_ID'),
  databaseId:props.getProperty('VEHICLE_FIRESTORE_DATABASE_ID')});
 const result=runFirestoreCrudPoc(crud,{newId:()=>Utilities.getUuid()});
 Logger.log(JSON.stringify(result)); // Step names/counters ONLY; no key, token or values.
 if(result.status!=='PASS')throw new Error('FIRESTORE_CRUD_POC_FAILED:'+(result.error||result.status));
 return result;
}

// Names-only Script Properties health report (VC-ADR-028 P1): missing required, unknown,
// retired-still-present and gates left on. NEVER returns or logs any property VALUE.
export function inspectVehicleConfigFromEditor() {
 const report=createApplication({propertiesService:PropertiesService}).inspectConfig();
 Logger.log(JSON.stringify(report));
 return report;
}

// L4 SSOT file proof (read-only, editor-only): Firestore photo rows ↔ Drive files, checked
// directly with DriveApp (not via the API). Logs counters + short id prefixes only.
export function verifyDrivePhotosFromEditor() {
 const folderId=PropertiesService.getScriptProperties().getProperty('VEHICLE_PHOTOS_FOLDER_ID');
 const result=auditDrivePhotos({store:editorStore(),driveApp:DriveApp,folderId});
 Logger.log(JSON.stringify(result));
 return result;
}
