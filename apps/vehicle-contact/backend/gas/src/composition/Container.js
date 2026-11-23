import {createOperationController} from '../api/controllers/OperationController.js';
import {createSessionService} from '../application/security/SessionService.js';
import {createRuntimeStore} from './StoreSelector.js';
import {snapshotScriptProperties,inspectScriptProperties} from './RuntimeConfig.js';
import {createGasSecurity} from '../infrastructure/security/GasSecurity.js';
import {createDrivePhotos} from '../infrastructure/media/DrivePhotos.js';
import { createAdditiveMigration } from "../infrastructure/migrations/ExecuteAdditiveMigration.js";
import { createApiRouter } from "../api/routes/Router.js";
import { createSheetsSchemaRepository } from "../infrastructure/persistence/sheets/SheetsSchemaRepository.js";
import { verifySchemaUseCase } from "../application/use-cases/VerifySchema.js";
import { DATABASE_SCHEMA } from "../domain/ports/SchemaRepository.js";
import { proposeSchemaChanges } from "../application/schema-sync/ProposeMigration.js";
import {createReferenceSeedInstaller} from '../infrastructure/reference/ReferenceSeedInstaller.js';
export function createApplication(deps={}) {
  const services=()=>({
    propertiesService:deps.propertiesService||(typeof PropertiesService!=='undefined'?PropertiesService:null),
    spreadsheetApp:deps.spreadsheetApp||(typeof SpreadsheetApp!=='undefined'?SpreadsheetApp:null),
    lockService:deps.lockService||(typeof LockService!=='undefined'?LockService:null),
    utilities:deps.utilities||(typeof Utilities!=='undefined'?Utilities:null),
    urlFetchApp:deps.urlFetchApp||(typeof UrlFetchApp!=='undefined'?UrlFetchApp:null),
    driveApp:deps.driveApp||(typeof DriveApp!=='undefined'?DriveApp:null)
  });
  const router=createApiRouter({readHealthInfo(){
    const s=services(),props=s.propertiesService&&s.propertiesService.getScriptProperties();
    if(!props)return undefined;
    return {persistence:{engine:'firestore',dualWrite:false}};
  },createProtectedDispatcher(){
    const s=services();
    // ONE PropertiesService read per request (was one service call per getProperty).
    const snap=snapshotScriptProperties(s.propertiesService),props=snap.props;
    if(props.getProperty('VEHICLE_API_ENABLED')!=='true')throw new Error('FEATURE_DISABLED');
    const clock=()=>new Date().toISOString();
    // Production runtime is Firestore-only (VC-ADR-026). Admin/testing tools (e.g. the Editor
    // staging probe) may inject their own store via deps.store; the HTTP entrypoint passes none.
    const store=deps.store||createRuntimeStore({props,services:s,clock});
    const security=createGasSecurity({utilities:s.utilities,urlFetchApp:s.urlFetchApp,propertiesService:snap.service,clock});
    const sessions=createSessionService({store,security});
    const folderId=props.getProperty('VEHICLE_PHOTOS_FOLDER_ID');
    const drivePhotos=folderId?createDrivePhotos({driveApp:s.driveApp,utilities:s.utilities,folderId}):{
      upload(){throw new Error('DRIVE_NOT_CONFIGURED');},read(){throw new Error('DRIVE_NOT_CONFIGURED');},trash(){throw new Error('DRIVE_NOT_CONFIGURED');}
    };
    return createOperationController({store,security,sessions,drivePhotos,
      allowDestructiveRetention:props.getProperty('VEHICLE_RETENTION_EXECUTE_ENABLED')==='true'});
  }});

  function schemaRepository() {
    const id=deps.propertiesService.getScriptProperties().getProperty("VEHICLE_SHEET_ID");
    return createSheetsSchemaRepository(deps.spreadsheetApp,id);
  }
  return Object.freeze({
    dispatch:router.dispatch,
    // Names-only Script Properties report (no values) for the owner's tidy-up.
    inspectConfig(){return inspectScriptProperties(services().propertiesService.getScriptProperties().getProperties());},
    migrateSchema(options){
      const id=deps.propertiesService.getScriptProperties().getProperty("VEHICLE_SHEET_ID");
      return createAdditiveMigration({spreadsheetApp:deps.spreadsheetApp,spreadsheetId:id,lockService:deps.lockService,driveApp:deps.driveApp,propertiesService:deps.propertiesService}).run(options);
    },
    previewReferenceSeed(){
      const s=services(),id=s.propertiesService.getScriptProperties().getProperty('VEHICLE_SHEET_ID');
      return createReferenceSeedInstaller({spreadsheetApp:s.spreadsheetApp,spreadsheetId:id,lockService:s.lockService,
        driveApp:s.driveApp,propertiesService:s.propertiesService,utilities:s.utilities}).preview();
    },
    applyReferenceSeed(){
      const s=services(),id=s.propertiesService.getScriptProperties().getProperty('VEHICLE_SHEET_ID');
      return createReferenceSeedInstaller({spreadsheetApp:s.spreadsheetApp,spreadsheetId:id,lockService:s.lockService,
        driveApp:s.driveApp,propertiesService:s.propertiesService,utilities:s.utilities}).apply();
    },
    recoverReferenceSeed(){
      const s=services(),id=s.propertiesService.getScriptProperties().getProperty('VEHICLE_SHEET_ID');
      return createReferenceSeedInstaller({spreadsheetApp:s.spreadsheetApp,spreadsheetId:id,lockService:s.lockService,
        driveApp:s.driveApp,propertiesService:s.propertiesService,utilities:s.utilities}).recover();
    },
    verifySchema(){return verifySchemaUseCase(schemaRepository());},
    inspectSchemaDrift(){
      const result=verifySchemaUseCase(schemaRepository());
      return {schemaId:DATABASE_SCHEMA.schemaId,version:DATABASE_SCHEMA.schemaVersion,match:result.ok,changes:result.mismatches};
    },
    proposeSchemaDrift(){
      const result=this.inspectSchemaDrift();
      return proposeSchemaChanges(result);
    }
  });
}
