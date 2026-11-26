import {createOperationController} from '../api/controllers/OperationController.js';
import {createSessionService} from '../application/security/SessionService.js';
import {createRuntimeStore} from './StoreSelector.js';
import {snapshotScriptProperties,inspectScriptProperties} from './RuntimeConfig.js';
import {createGasSecurity} from '../infrastructure/security/GasSecurity.js';
import {createDrivePhotos} from '../infrastructure/media/DrivePhotos.js';
import { createApiRouter } from "../api/routes/Router.js";
import {createRequestProfiler,isProfiled} from '../infrastructure/profiling/RequestProfiler.js';
export function createProcessMemo(ttlMs,nowMs=()=>Date.now()){
  let entry=null;
  return {get:()=>(entry&&nowMs()<entry.exp?entry.value:undefined),put:value=>{entry={value,exp:nowMs()+ttlMs};},clear:()=>{entry=null;}};
}
export function createApplication(deps={}) {
  let prof=null; // request-scoped profiler, only for requestId "prof_*"
  // TUNEUP R2: process-lifetime memo for reference rows (Cloud Run passes referenceCacheMs; GAS: off).
  const referenceMemo=deps.referenceCacheMs>0?createProcessMemo(deps.referenceCacheMs):null;
  // VC-ADR-040: the log policy is read at most once a minute per process (GAS: once per execution).
  const logPolicyMemo=createProcessMemo(deps.logPolicyCacheMs>=0?deps.logPolicyCacheMs:60000);
  const raw=()=>({
    propertiesService:deps.propertiesService||(typeof PropertiesService!=='undefined'?PropertiesService:null),
    utilities:deps.utilities||(typeof Utilities!=='undefined'?Utilities:null),
    urlFetchApp:deps.urlFetchApp||(typeof UrlFetchApp!=='undefined'?UrlFetchApp:null),
    driveApp:deps.driveApp||(typeof DriveApp!=='undefined'?DriveApp:null),
    // Script-scoped CacheService (private to this project): Firestore access token + short session snapshots.
    cache:deps.cache!==undefined?deps.cache:(typeof CacheService!=='undefined'?CacheService.getScriptCache():null),
    // TUNEUP R3: access-token cache only (never sessions). Cloud Run passes a process cache; GAS uses CacheService.
    tokenCache:deps.tokenCache||null
  });
  const services=()=>{const s=raw();if(!prof)return s;
    return {...s,urlFetchApp:prof.wrapUrlFetch(s.urlFetchApp),cache:prof.wrapCache(s.cache),propertiesService:prof.wrapProperties(s.propertiesService)};};
  const router=createApiRouter({readHealthInfo(){
    const s=services(),props=s.propertiesService&&s.propertiesService.getScriptProperties();
    if(!props)return undefined;
    return {persistence:{engine:'firestore',dualWrite:false}};
  },createProtectedDispatcher(){
    return prof?prof.phase('compose',composeDispatcher):composeDispatcher();
  }});
  function composeDispatcher(){
    const s=services();
    // ONE PropertiesService read per request (was one service call per getProperty).
    const snap=snapshotScriptProperties(s.propertiesService),props=snap.props;
    if(props.getProperty('VEHICLE_API_ENABLED')!=='true')throw new Error('FEATURE_DISABLED');
    const clock=()=>new Date().toISOString();
    // Production runtime is Firestore-only (VC-ADR-026). Admin/testing tools (e.g. the Editor
    // staging probe) may inject their own store via deps.store; the HTTP entrypoint passes none.
    const store=deps.store||createRuntimeStore({props,services:s,clock});
    const security=createGasSecurity({utilities:s.utilities,urlFetchApp:s.urlFetchApp,propertiesService:snap.service,clock});
    const rawSessions=createSessionService({store,security,cache:s.cache});
    const sessions=prof?{...rawSessions,authorize:(...a)=>prof.phase('authorize',()=>rawSessions.authorize(...a))}:rawSessions;
    const folderId=props.getProperty('VEHICLE_PHOTOS_FOLDER_ID');
    // deps.drivePhotos: the Cloud Run host injects the signed Drive bridge (VC-ADR-034).
    const drivePhotos=deps.drivePhotos?deps.drivePhotos:folderId?createDrivePhotos({driveApp:s.driveApp,utilities:s.utilities,folderId}):{
      upload(){throw new Error('DRIVE_NOT_CONFIGURED');},read(){throw new Error('DRIVE_NOT_CONFIGURED');},trash(){throw new Error('DRIVE_NOT_CONFIGURED');},trashAll(){throw new Error('DRIVE_NOT_CONFIGURED');}
    };
    const controller=createOperationController({store,security,sessions,drivePhotos:prof?prof.wrapDrivePhotos(drivePhotos):drivePhotos,
      allowDestructiveRetention:props.getProperty('VEHICLE_RETENTION_EXECUTE_ENABLED')==='true',
      allowSystemReset:props.getProperty('VEHICLE_SYSTEM_RESET_ENABLED')==='true',referenceMemo,logPolicyMemo});
    return prof?{dispatch:req=>prof.phase('controller',()=>controller.dispatch(req))}:controller;
  }

  return Object.freeze({
    // Profiled requests (requestId "prof_*") get serverTiming (durations/counts only) appended.
    dispatch(request,method){
      if(!isProfiled(request))return router.dispatch(request,method);
      prof=createRequestProfiler();
      try{const out=router.dispatch(request,method);return {...out,serverTiming:prof.report()};}
      finally{prof=null;}
    },
    // Names-only Script Properties report (no values) for the owner's tidy-up.
    inspectConfig(){return inspectScriptProperties(services().propertiesService.getScriptProperties().getProperties());}
  });
}
