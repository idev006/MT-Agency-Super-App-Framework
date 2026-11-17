import {createOperationDispatcher} from '../application/use-cases/OperationDispatcher.js';
import {createSessionService} from '../application/security/SessionService.js';
import {createSheetStore} from '../infrastructure/persistence/sheets/SheetStore.js';
import {createGasSecurity} from '../infrastructure/security/GasSecurity.js';
import {createDrivePhotos} from '../infrastructure/media/DrivePhotos.js';
import { createAdditiveMigration } from "../application/schema-sync/ExecuteMigration.js";
import { createApiRouter } from "../api/routes/Router.js";
import { createSheetsSchemaRepository } from "../infrastructure/persistence/sheets/SheetsSchemaRepository.js";
import { verifySchemaUseCase } from "../application/use-cases/VerifySchema.js";
import { DATABASE_SCHEMA } from "../domain/ports/SchemaRepository.js";
import { proposeSchemaChanges } from "../application/schema-sync/ProposeMigration.js";
export function createApplication(deps={}) {
  const services=()=>({
    propertiesService:deps.propertiesService||(typeof PropertiesService!=='undefined'?PropertiesService:null),
    spreadsheetApp:deps.spreadsheetApp||(typeof SpreadsheetApp!=='undefined'?SpreadsheetApp:null),
    lockService:deps.lockService||(typeof LockService!=='undefined'?LockService:null),
    utilities:deps.utilities||(typeof Utilities!=='undefined'?Utilities:null),
    urlFetchApp:deps.urlFetchApp||(typeof UrlFetchApp!=='undefined'?UrlFetchApp:null),
    driveApp:deps.driveApp||(typeof DriveApp!=='undefined'?DriveApp:null)
  });
  const router=createApiRouter({createProtectedDispatcher(){
    const s=services(),props=s.propertiesService.getScriptProperties();
    if(props.getProperty('VEHICLE_API_ENABLED')!=='true')throw new Error('FEATURE_DISABLED');
    const spreadsheetId=props.getProperty('VEHICLE_SHEET_ID');
    const store=createSheetStore({spreadsheetApp:s.spreadsheetApp,spreadsheetId,lockService:s.lockService});
    const clock=()=>new Date().toISOString();
    const security=createGasSecurity({utilities:s.utilities,urlFetchApp:s.urlFetchApp,propertiesService:s.propertiesService,clock});
    const sessions=createSessionService({store,security});
    const folderId=props.getProperty('VEHICLE_PHOTOS_FOLDER_ID');
    const drivePhotos=folderId?createDrivePhotos({driveApp:s.driveApp,utilities:s.utilities,folderId}):{
      upload(){throw new Error('DRIVE_NOT_CONFIGURED');},trash(){throw new Error('DRIVE_NOT_CONFIGURED');}
    };
    return createOperationDispatcher({store,security,sessions,drivePhotos,
      allowDestructiveRetention:props.getProperty('VEHICLE_RETENTION_EXECUTE_ENABLED')==='true'});
  }});

  function schemaRepository() {
    const id=deps.propertiesService.getScriptProperties().getProperty("VEHICLE_SHEET_ID");
    return createSheetsSchemaRepository(deps.spreadsheetApp,id);
  }
  return Object.freeze({
    dispatch:router.dispatch,
    migrateSchema(options){
      const id=deps.propertiesService.getScriptProperties().getProperty("VEHICLE_SHEET_ID");
      return createAdditiveMigration({spreadsheetApp:deps.spreadsheetApp,spreadsheetId:id,lockService:deps.lockService}).run(options);
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
