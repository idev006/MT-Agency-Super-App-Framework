import {createSheetStore} from '../infrastructure/persistence/sheets/SheetStore.js';
import {createFirestoreStore} from '../infrastructure/persistence/firestore/FirestoreStore.js';
import {createFirestoreRestGateway} from '../infrastructure/persistence/firestore/FirestoreRestGateway.js';

// F3a backend selection (D-E1 Option 2 / VC-ADR-019). Default stays Sheets; the Firestore
// engine is opt-in per deployment via Script Property VEHICLE_PERSISTENCE_BACKEND and
// fails closed on unknown values or missing credentials. Only the runtime dispatch store
// is selected here — schema/migration/seed maintenance paths remain Sheets-bound.
export function createStoreForBackend({backend,props,services,clock}){
  const mode=backend||'sheets';
  if(mode==='sheets'){
    return createSheetStore({spreadsheetApp:services.spreadsheetApp,
      spreadsheetId:props.getProperty('VEHICLE_SHEET_ID'),lockService:services.lockService});
  }
  if(mode!=='firestore')throw new Error('UNKNOWN_PERSISTENCE_BACKEND:'+mode);
  const raw=props.getProperty('VEHICLE_FIRESTORE_SA_KEY');
  if(!raw)throw new Error('STORAGE_NOT_CONFIGURED');
  let key;
  try{key=JSON.parse(raw);}catch(_){throw new Error('INVALID_FIRESTORE_SA_KEY');}
  const gateway=createFirestoreRestGateway({utilities:services.utilities,urlFetchApp:services.urlFetchApp,
    clientEmail:key.client_email,privateKey:key.private_key,
    projectId:props.getProperty('VEHICLE_FIRESTORE_PROJECT_ID')||key.project_id,
    databaseId:props.getProperty('VEHICLE_FIRESTORE_DATABASE_ID')||'(default)',clock});
  return createFirestoreStore({firestore:gateway});
}