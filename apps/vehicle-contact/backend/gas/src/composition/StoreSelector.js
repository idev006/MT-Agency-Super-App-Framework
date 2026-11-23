import {createFirestoreStore} from '../infrastructure/persistence/firestore/FirestoreStore.js';
import {createFirestoreRestGateway} from '../infrastructure/persistence/firestore/FirestoreRestGateway.js';

// Runtime persistence is Firestore-only (VC-ADR-026). The Sheets adapter and the dual-write
// mirror were retired from the API dispatch path; SheetStore survives solely for admin
// maintenance tools (bootstrap, password reset, staging probe). Fails closed on missing or
// malformed service-account credentials before any network call.
export function createRuntimeStore({props,services,clock}){
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