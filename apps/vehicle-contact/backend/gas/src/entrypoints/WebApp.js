import {runStagingAuthAcceptance,runStagingLifecycleAcceptance} from '../infrastructure/testing/StagingAcceptanceProbe.js';
import {normalizeNumberFormats} from '../infrastructure/persistence/sheets/NumberFormatRepair.js';
import {repairDisplayErrors} from '../infrastructure/persistence/sheets/DisplayErrorRepair.js';
import {resetDevData} from '../infrastructure/persistence/sheets/DevDataReset.js';
import {runFirestoreRestPoc} from '../infrastructure/persistence/firestore/FirestoreRestPoc.js';
import {benchmarkStagingPasswordHash} from '../infrastructure/security/HashDiagnostics.js';
import {createOneTimeAdminPasswordReset} from '../infrastructure/security/AdminPasswordReset.js';
import {bootstrapStagingAdmin} from '../infrastructure/bootstrap/BootstrapAdmin.js';
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
export function verifyVehicleSchemaFromEditor() {
  const a=createApplication({propertiesService:PropertiesService,spreadsheetApp:SpreadsheetApp});
  const result=a.verifySchema();
  Logger.log(JSON.stringify(result));
  return result;
}
export function inspectVehicleSchemaDriftFromEditor() {
  const a=createApplication({propertiesService:PropertiesService,spreadsheetApp:SpreadsheetApp});
  const diff=a.inspectSchemaDrift();
  Logger.log(JSON.stringify(diff));
  return diff;
}
export function proposeVehicleSchemaChangeFromEditor() {
  const a=createApplication({propertiesService:PropertiesService,spreadsheetApp:SpreadsheetApp});
  const proposal=a.proposeSchemaDrift();
  Logger.log(JSON.stringify(proposal));
  return proposal;
}

// Run only from GAS Editor. Dry-run by default; no public HTTP access.
export function migrateVehicleSchemaFromEditor() {
 const a=createApplication({propertiesService:PropertiesService,spreadsheetApp:SpreadsheetApp,lockService:LockService});
 const result=a.migrateSchema({dryRun:true});
 Logger.log(JSON.stringify(result));
 return result;
}

// Explicitly gated GAS Editor action. Never callable over HTTP.
export function applyVehicleSchemaFromEditor() {
 const props=PropertiesService.getScriptProperties();
 if(props.getProperty('VEHICLE_SCHEMA_MIGRATION_APPROVED')!=='true')
  throw new Error('EXPLICIT_MIGRATION_APPROVAL_REQUIRED');
 const a=createApplication({propertiesService:PropertiesService,spreadsheetApp:SpreadsheetApp,
   lockService:LockService,driveApp:DriveApp});
 const result=a.migrateSchema({dryRun:false,approvalCode:'APPROVE_ADDITIVE_SCHEMA_MIGRATION'});
 Logger.log(JSON.stringify({status:result.status,schemaVersion:result.schemaVersion,backupCreated:Boolean(result.backupRef)}));
 return result;
}

// Trusted Editor-only catalog seed. Preview never writes; apply consumes an exact checksum approval.
export function previewVehicleReferenceSeedFromEditor() {
 const result=createApplication({propertiesService:PropertiesService,spreadsheetApp:SpreadsheetApp,
   lockService:LockService,driveApp:DriveApp,utilities:Utilities}).previewReferenceSeed();
 Logger.log(JSON.stringify(result));
 return result;
}
export function applyVehicleReferenceSeedFromEditor() {
 const result=createApplication({propertiesService:PropertiesService,spreadsheetApp:SpreadsheetApp,
   lockService:LockService,driveApp:DriveApp,utilities:Utilities}).applyReferenceSeed();
 Logger.log(JSON.stringify({status:result.status,seedVersion:result.seedVersion,rowCount:result.rowCount,
   checksum:result.checksum,backupCreated:result.backupCreated===true,mode:result.mode}));
 return result;
}
export function recoverVehicleReferenceSeedFromEditor() {
 const result=createApplication({propertiesService:PropertiesService,spreadsheetApp:SpreadsheetApp,
   lockService:LockService,driveApp:DriveApp,utilities:Utilities}).recoverReferenceSeed();
 Logger.log(JSON.stringify({status:result.status,seedVersion:result.seedVersion,clearedCount:result.clearedCount}));
 return result;
}

// Run only after additive migration, in a synthetic staging spreadsheet. Never over HTTP.
export function bootstrapVehicleAdminFromEditor() {
 const result=bootstrapStagingAdmin({spreadsheetApp:SpreadsheetApp,lockService:LockService,
  utilities:Utilities,propertiesService:PropertiesService});
 Logger.log(JSON.stringify(result));
 return result;
}

// Safe GAS Editor-only performance diagnostic. Never logs secret/password/hash or mutates users.
export function benchmarkVehiclePasswordHashFromEditor() {
 const result=benchmarkStagingPasswordHash({utilities:Utilities,propertiesService:PropertiesService});
 Logger.log(JSON.stringify(result));
 return result;
}


// Editor-only: test actual GAS+Sheets on isolated synthetic sandbox; no production Script Properties edits.
export function runVehicleStagingAuthTestsFromEditor() {
 const result=runStagingAuthAcceptance({spreadsheetApp:SpreadsheetApp,lockService:LockService,
  utilities:Utilities,driveApp:DriveApp,urlFetchApp:UrlFetchApp});
 Logger.log(JSON.stringify(result));
 if(result.failed)throw new Error('STAGING_AUTH_ACCEPTANCE_FAILED:'+result.failed);
 return result;
}
export function runVehicleStagingLifecycleTestsFromEditor() {
 const result=runStagingLifecycleAcceptance({spreadsheetApp:SpreadsheetApp,lockService:LockService,
  utilities:Utilities,driveApp:DriveApp,urlFetchApp:UrlFetchApp});
 Logger.log(JSON.stringify(result));
 if(result.failed)throw new Error('STAGING_LIFECYCLE_ACCEPTANCE_FAILED:'+result.failed);
 return result;
}

// Trusted GAS Editor ONLY. PREVIEW reads account/backup policy; NEVER changes rows.
export function inspectVehicleAdminResetFromEditor() {
 const tool=createOneTimeAdminPasswordReset({
  spreadsheetApp:SpreadsheetApp,lockService:LockService,
  utilities:Utilities,propertiesService:PropertiesService,driveApp:DriveApp
 });
 const result=tool.inspect();
 Logger.log(JSON.stringify(result)); // No secret, hash, userId or backup file ID.
 return result;
}

// Explicitly approved one-time reset. This is NOT an HTTP operation.
export function resetVehicleAdminPasswordFromEditor() {
 const tool=createOneTimeAdminPasswordReset({
  spreadsheetApp:SpreadsheetApp,lockService:LockService,
  utilities:Utilities,propertiesService:PropertiesService,driveApp:DriveApp
 });
 const result=tool.apply();
 Logger.log(JSON.stringify(result)); // Sanitized counters and state ONLY.
 return result;
}

// Trusted GAS Editor ONLY. Format-only repair of the setNumberFormat(singular)
// display bug; reports per-sheet mismatch scope and re-applies correct formats.
// NEVER touches cell values. Not callable over doGet/doPost.
export function normalizeVehicleNumberFormatsFromEditor() {
 const spreadsheetId=PropertiesService.getScriptProperties().getProperty('VEHICLE_SHEET_ID');
 const result=normalizeNumberFormats({spreadsheetApp:SpreadsheetApp,spreadsheetId,lockService:LockService});
 Logger.log(JSON.stringify(result));
 return result;
}

// Trusted GAS Editor ONLY. Audits every schema sheet for visible spreadsheet errors.
// Writes only legacy vehicle province errors with an exact approved-registration match.
export function repairVehicleDisplayErrorsFromEditor() {
 const spreadsheetId=PropertiesService.getScriptProperties().getProperty('VEHICLE_SHEET_ID');
 const result=repairDisplayErrors({spreadsheetApp:SpreadsheetApp,spreadsheetId,lockService:LockService});
 Logger.log(JSON.stringify(result));
 return result;
}

// Trusted GAS Editor ONLY. Synthetic DEV clean-slate truncate (Mode B). Requires an exact
// script-property approval gate; clears transactional data rows only, preserves headers and
// identity/config/reference tables, and captures a full backup before mutation. Never over HTTP.
export function resetDevDataFromEditor() {
 const props=PropertiesService.getScriptProperties();
 if(props.getProperty('VEHICLE_DEV_RESET_APPROVED')!=='RUN_SYNTHETIC_DEV_RESET')
  throw new Error('EXPLICIT_DEV_RESET_APPROVAL_REQUIRED');
 const spreadsheetId=props.getProperty('VEHICLE_SHEET_ID');
 const result=resetDevData({spreadsheetApp:SpreadsheetApp,spreadsheetId,lockService:LockService});
 Logger.log(JSON.stringify({status:result.status,totalRowsCleared:result.totalRowsCleared,
  backupRows:result.backupRows,clearedTables:result.clearedTables,preservedTables:result.preservedTables,
  drift:result.drift||[],failedTable:result.failedTable||null})); // Counters only; no row values/PII.
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
