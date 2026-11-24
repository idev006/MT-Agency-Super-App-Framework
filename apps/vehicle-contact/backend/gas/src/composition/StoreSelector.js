import {createFirestoreStore} from '../infrastructure/persistence/firestore/FirestoreStore.js';
import {createFirestoreRestGateway} from '../infrastructure/persistence/firestore/FirestoreRestGateway.js';

// Runtime persistence is Firestore-only (VC-ADR-026). Since S1 (VC-ADR-029) the editor admin
// tools use this same store; no Google Sheets adapter remains. Fails closed on missing or
// malformed service-account credentials before any network call.
export function createRuntimeStore({props,services,clock}){
  const raw=props.getProperty('VEHICLE_FIRESTORE_SA_KEY');
  if(!raw)throw new Error('STORAGE_NOT_CONFIGURED');
  let key;
  try{key=JSON.parse(raw);}catch(_){throw new Error('INVALID_FIRESTORE_SA_KEY');}
  const gateway=createFirestoreRestGateway({utilities:services.utilities,urlFetchApp:services.urlFetchApp,
    clientEmail:key.client_email,privateKey:key.private_key,
    projectId:props.getProperty('VEHICLE_FIRESTORE_PROJECT_ID')||key.project_id,
    databaseId:props.getProperty('VEHICLE_FIRESTORE_DATABASE_ID')||'(default)',clock,tokenCache:services.cache||null});
  return createFirestoreStore({firestore:gateway});
}
// The Firestore project the runtime store targets (used as an admin-reset target confirmation).
export function runtimeProjectId(props){
  const raw=props.getProperty('VEHICLE_FIRESTORE_SA_KEY');
  let key={};try{key=raw?JSON.parse(raw):{};}catch(_){key={};}
  return props.getProperty('VEHICLE_FIRESTORE_PROJECT_ID')||key.project_id||null;
}
