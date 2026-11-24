import {createOperationController} from '../api/controllers/OperationController.js';
import {createSessionService} from '../application/security/SessionService.js';
import {createRuntimeStore} from './StoreSelector.js';
import {snapshotScriptProperties,inspectScriptProperties} from './RuntimeConfig.js';
import {createGasSecurity} from '../infrastructure/security/GasSecurity.js';
import {createDrivePhotos} from '../infrastructure/media/DrivePhotos.js';
import { createApiRouter } from "../api/routes/Router.js";
export function createApplication(deps={}) {
  const services=()=>({
    propertiesService:deps.propertiesService||(typeof PropertiesService!=='undefined'?PropertiesService:null),
    utilities:deps.utilities||(typeof Utilities!=='undefined'?Utilities:null),
    urlFetchApp:deps.urlFetchApp||(typeof UrlFetchApp!=='undefined'?UrlFetchApp:null),
    driveApp:deps.driveApp||(typeof DriveApp!=='undefined'?DriveApp:null),
    // Script-scoped CacheService (private to this project): Firestore access token + short session snapshots.
    cache:deps.cache!==undefined?deps.cache:(typeof CacheService!=='undefined'?CacheService.getScriptCache():null)
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
    const sessions=createSessionService({store,security,cache:s.cache});
    const folderId=props.getProperty('VEHICLE_PHOTOS_FOLDER_ID');
    const drivePhotos=folderId?createDrivePhotos({driveApp:s.driveApp,utilities:s.utilities,folderId}):{
      upload(){throw new Error('DRIVE_NOT_CONFIGURED');},read(){throw new Error('DRIVE_NOT_CONFIGURED');},trash(){throw new Error('DRIVE_NOT_CONFIGURED');}
    };
    return createOperationController({store,security,sessions,drivePhotos,
      allowDestructiveRetention:props.getProperty('VEHICLE_RETENTION_EXECUTE_ENABLED')==='true'});
  }});

  return Object.freeze({
    dispatch:router.dispatch,
    // Names-only Script Properties report (no values) for the owner's tidy-up.
    inspectConfig(){return inspectScriptProperties(services().propertiesService.getScriptProperties().getProperties());}
  });
}
