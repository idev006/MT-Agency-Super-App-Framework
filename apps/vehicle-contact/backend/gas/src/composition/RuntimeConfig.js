// Script Properties catalog (SSOT) + names-only inspection. Values are NEVER returned,
// logged or compared beyond presence / the documented literal flags.
// kinds: required = API cannot run without it · optional = feature/default fallback ·
// admin = maintenance tools only · gate = set just before an editor run, then delete ·
// state = written by the system itself, never edit by hand · retired = no code reads it.
export const SCRIPT_PROPERTIES=Object.freeze({
  VEHICLE_API_ENABLED:{kind:'required',note:"'true' enables protected API ingress"},
  VEHICLE_AUTH_PEPPER:{kind:'required',note:'secret, >=32 chars; password hashing + token MAC'},
  VEHICLE_FIRESTORE_SA_KEY:{kind:'required',note:'secret, service-account JSON key (runtime datastore)'},
  VEHICLE_PHOTOS_FOLDER_ID:{kind:'optional',note:'Drive folder for photos; photo ops fail closed without it'},
  VEHICLE_MEDIA_BRIDGE_SECRET:{kind:'optional',note:'secret, >=32 chars; Cloud Run -> Drive photo bridge (VC-ADR-034); bridge disabled without it'},
  VEHICLE_GOOGLE_CLIENT_ID:{kind:'optional',note:'OIDC audience for auth.googleLogin'},
  VEHICLE_FIRESTORE_PROJECT_ID:{kind:'optional',note:'defaults to project_id inside the SA key'},
  VEHICLE_FIRESTORE_DATABASE_ID:{kind:'optional',note:"defaults to '(default)'"},
  VEHICLE_RETENTION_EXECUTE_ENABLED:{kind:'optional',note:"destructive retention; keep absent (C5 BLOCKED on D5+B3)"},
  VEHICLE_BOOTSTRAP_USERNAME:{kind:'admin',note:'bootstrap admin username'},
  VEHICLE_BOOTSTRAP_IDLE_MINUTES:{kind:'admin',note:'bootstrap session idle policy'},
  VEHICLE_BOOTSTRAP_TEMP_PASSWORD:{kind:'gate',note:'consumed + deleted by bootstrap'},
  VEHICLE_BOOTSTRAP_STAGING_APPROVED:{kind:'gate',note:'consumed + deleted by bootstrap'},
  VEHICLE_FIRESTORE_POC_APPROVED:{kind:'gate',note:"'RUN_SYNTHETIC_FIRESTORE_POC' for editor POCs"},
  VEHICLE_ADMIN_RESET_APPROVAL:{kind:'gate',note:"admin password reset ('RESET_ADMIN_ONCE')"},
  VEHICLE_ADMIN_RESET_NEW_PASSWORD:{kind:'gate',note:'secret, consumed by admin password reset'},
  VEHICLE_ADMIN_RESET_EXPECTED_PROJECT_ID:{kind:'gate',note:'admin password reset target confirmation (must equal the runtime Firestore project)'},
  VEHICLE_ADMIN_RESET_EXPECTED_USER_ID:{kind:'gate',note:'admin password reset target confirmation'},
  VEHICLE_REFERENCE_SEED_APPROVED_SHA256:{kind:'gate',note:'reference seed apply (consumed)'},
  VEHICLE_REFERENCE_SEED_RECOVERY_APPROVED:{kind:'gate',note:'reference seed recovery (consumed)'},
  VEHICLE_REFERENCE_SEED_JOURNAL:{kind:'state',note:'written by reference seed installer'},
  VEHICLE_ADMIN_RESET_STATE:{kind:'state',note:'written by admin password reset'},
  VEHICLE_PERSISTENCE_BACKEND:{kind:'retired',note:'engine flag retired by Slice G (VC-ADR-026) — delete'},
  VEHICLE_FIRESTORE_DUALWRITE:{kind:'retired',note:'dual-write retired by Slice G (VC-ADR-026) — delete'},
  VEHICLE_SHEET_ID:{kind:'retired',note:'Google Sheets fully removed by S1 (VC-ADR-029) — delete'},
  VEHICLE_SCHEMA_MIGRATION_APPROVED:{kind:'retired',note:'Sheets schema migration removed by S1 — delete'},
  VEHICLE_DEV_RESET_APPROVED:{kind:'retired',note:'Sheets DEV reset removed by S1 — delete'},
  VEHICLE_MIGRATION_JOURNAL:{kind:'retired',note:'Sheets migration journal removed by S1 — delete'},
  VEHICLE_ADMIN_RESET_EXPECTED_SHEET_ID:{kind:'retired',note:'replaced by VEHICLE_ADMIN_RESET_EXPECTED_PROJECT_ID (S1) — delete'},
  VEHICLE_ADMIN_RESET_BACKUP_FILE_ID:{kind:'retired',note:'Sheets backup gate removed by S1 — delete'}
});

// One PropertiesService round per request instead of one per getProperty (each is a
// service call). Returns a read-only props facade compatible with existing adapters.
export function snapshotScriptProperties(propertiesService){
  const raw=propertiesService.getScriptProperties();
  if(typeof raw.getProperties!=='function')return {props:raw,service:propertiesService}; // minimal fakes
  const all=raw.getProperties()||{};
  const facade=Object.freeze({getProperty:name=>Object.prototype.hasOwnProperty.call(all,name)?all[name]:null});
  return {props:facade,service:Object.freeze({getScriptProperties:()=>facade})};
}

// Names-only health report for the owner: what is missing, unknown, retired or left on.
export function inspectScriptProperties(all){
  const present=Object.keys(all||{}).filter(k=>all[k]!==null&&all[k]!==undefined&&all[k]!=='');
  const has=name=>present.includes(name);
  const ofKind=kind=>Object.keys(SCRIPT_PROPERTIES).filter(n=>SCRIPT_PROPERTIES[n].kind===kind);
  const report={
    missingRequired:ofKind('required').filter(n=>!has(n)),
    apiEnabled:all&&all.VEHICLE_API_ENABLED==='true',
    optionalPresent:ofKind('optional').filter(has),
    gatesLeftOn:ofKind('gate').filter(has),
    retiredPresent:ofKind('retired').filter(has),
    unknown:present.filter(n=>!Object.prototype.hasOwnProperty.call(SCRIPT_PROPERTIES,n)).sort(),
    retentionExecuteEnabled:all&&all.VEHICLE_RETENTION_EXECUTE_ENABLED==='true'
  };
  report.ok=report.missingRequired.length===0&&report.apiEnabled&&!report.retentionExecuteEnabled;
  return report;
}
