import {createSheetStore} from '../infrastructure/persistence/sheets/SheetStore.js';
import {createFirestoreStore} from '../infrastructure/persistence/firestore/FirestoreStore.js';
import {createFirestoreRestGateway} from '../infrastructure/persistence/firestore/FirestoreRestGateway.js';
import {createDualWriteStore} from '../infrastructure/persistence/firestore/DualWriteStore.js';

// F3a backend selection (D-E1 Option 2 / VC-ADR-019). Default stays Sheets; the Firestore
// engine is opt-in per deployment via Script Property VEHICLE_PERSISTENCE_BACKEND and
// fails closed on unknown values or missing credentials. Only the runtime dispatch store
// is selected here — schema/migration/seed maintenance paths remain Sheets-bound.
// F3b: VEHICLE_FIRESTORE_DUALWRITE=true mirrors writes to the STANDBY engine (direction
// follows the primary): sheets mode -> Firestore shadow; firestore mode -> Sheets shadow
// kept warm for the rollback window (E1 §5.5). Divergence journals to the PRIMARY's
// vc_operation_journal. Clear the flag to retire mirroring. Missing shadow credentials
// fail closed in sheets mode.
export function createStoreForBackend({backend,props,services,clock}){
  const mode=backend||'sheets';
  const sheetsStore=()=>createSheetStore({spreadsheetApp:services.spreadsheetApp,
    spreadsheetId:props.getProperty('VEHICLE_SHEET_ID'),lockService:services.lockService});
  const firestoreStore=()=>{
    const raw=props.getProperty('VEHICLE_FIRESTORE_SA_KEY');
    if(!raw)throw new Error('STORAGE_NOT_CONFIGURED');
    let key;
    try{key=JSON.parse(raw);}catch(_){throw new Error('INVALID_FIRESTORE_SA_KEY');}
    const gateway=createFirestoreRestGateway({utilities:services.utilities,urlFetchApp:services.urlFetchApp,
      clientEmail:key.client_email,privateKey:key.private_key,
      projectId:props.getProperty('VEHICLE_FIRESTORE_PROJECT_ID')||key.project_id,
      databaseId:props.getProperty('VEHICLE_FIRESTORE_DATABASE_ID')||'(default)',clock});
    return createFirestoreStore({firestore:gateway});
  };
  const dual=(primary,secondary)=>createDualWriteStore({primary,secondary,clock,
    journal:{record:entry=>primary.insert('vc_operation_journal',
      {event_id:services.utilities.getUuid(),actor_id:'SYSTEM',...entry})}});
  const mirror=props.getProperty('VEHICLE_FIRESTORE_DUALWRITE')==='true';
  if(mode==='sheets'){
    const primary=sheetsStore();
    return mirror?dual(primary,firestoreStore()):primary;
  }
  if(mode!=='firestore')throw new Error('UNKNOWN_PERSISTENCE_BACKEND:'+mode);
  const primary=firestoreStore();
  return mirror?dual(primary,sheetsStore()):primary;
}