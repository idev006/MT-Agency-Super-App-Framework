// Read-only Sheets SSOT data audit — runs in the logged-in Google Sheets page context.
//
// WHY: an API "OK" response is not proof the persisted Sheets data is correct. A full
// test must independently recheck the SSOT spreadsheet (raw cells), not trust the API.
//
// HOW TO RUN (no mutation, no credentials in this file):
//   1. Open the target spreadsheet in the Qoder in-app browser while logged in to an
//      authorized Google account (browser-use navigate_page to the /edit URL).
//   2. Pass the body of auditSheetsData below to browser-use evaluate_script (or paste
//      into DevTools console on that page). The spreadsheet id is read from location,
//      so this script is generic and never hardcodes a private resource id.
//   3. It fetches each sheet via the read-only gviz CSV export (credentials:'include'),
//      parses raw display values, and returns SANITIZED counters only (no names, phones,
//      hashes, tokens or application_json).
//
// SCHEMA MIRROR: the column lists below mirror DATABASE_SCHEMA in
// src/domain/ports/SchemaRepository.js (the source of truth). headerOk detects any drift
// between this mirror and the live sheet; keep them in sync when the schema changes.
//
// RBAC NOTE: vc_roles / vc_role_permissions are schema-declared but NOT runtime-populated.
// The authoritative role->permission policy is the frozen code catalog ROLE_PERMISSIONS in
// src/application/security/SessionService.js; vc_user_roles.role_id stores the role NAME.
// Empty role sheets with populated vc_user_roles is therefore BY DESIGN, not corruption.
async function auditSheetsData() {
  const m = location.pathname.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return { error: 'NOT_ON_A_SPREADSHEET_PAGE' };
  const id = m[1];
  const schema = {
    vc_vehicles: ['vehicle_id','plate_normalized','province_code','vehicle_type','make','model','color','status','version','created_at','updated_at','created_by','updated_by','plate_type','organization_id','owner_user_id'],
    vc_vehicle_contacts: ['contact_id','vehicle_id','display_name','phone_e164','relationship','is_primary','status','verified_at','created_at','updated_at'],
    vc_qr_tokens: ['qr_id','vehicle_id','token_digest','issued_at','revoked_at','issued_by','reason','status'],
    vc_vehicle_photos: ['photo_id','vehicle_id','slot','storage_ref','mime_type','size_bytes','status','version','created_at'],
    vc_lookup_audit: ['audit_id','actor_id','vehicle_id','lookup_source','result','correlation_id','created_at'],
    vc_change_audit: ['audit_id','actor_id','entity_type','entity_id','action','redacted_summary','correlation_id','created_at'],
    vc_users: ['user_id','username_normalized','display_name','password_hash','password_salt','password_change_required','status','org_id','created_at','updated_at'],
    vc_user_identities: ['identity_id','user_id','provider','provider_sub','linked_at'],
    vc_roles: ['role_id','name','status'],
    vc_user_roles: ['assignment_id','user_id','role_id','status'],
    vc_role_permissions: ['assignment_id','role_id','permission','status'],
    vc_user_permissions: ['assignment_id','user_id','permission','status'],
    vc_sessions: ['session_id','user_id','token_digest','status','issued_at','expires_at','idle_timeout_minutes','last_seen_at','revoked_at'],
    vc_organizations: ['organization_id','name','org_type','parent_id','status','created_at','updated_at'],
    vc_campaigns: ['campaign_id','token_digest','starts_at','ends_at','max_submissions','submitted_count','revoked_at','status','created_by','created_at'],
    vc_registration_requests: ['request_id','vehicle_id','campaign_id','status','submitted_at','reviewed_by','reviewed_at','application_json','idempotency_key'],
    vc_change_requests: ['change_id','vehicle_id','proposed_delta','status','submitted_by','submitted_at','reviewed_by','reviewed_at'],
    vc_retention_jobs: ['job_id','vehicle_id','due_at','status','approved_by','approved_at','attempts','last_error','legal_hold','created_at','updated_at'],
    vc_settings: ['key','value','updated_by','updated_at'],
    vc_photo_staging: ['photo_id','campaign_id','slot','storage_ref','mime_type','size_bytes','status','created_at','used_at'],
    vc_idempotency: ['key','operation','actor_id','request_digest','result_json','status','created_at'],
    vc_operation_journal: ['event_id','operation','entity_id','actor_id','status','detail_json','created_at'],
    vc_migration_journal: ['migration_id','schema_version','status','backup_ref','started_at','completed_at','error'],
    vc_reference_values: ['reference_id','catalog','code','label_th','parent_code','sort_order','status','updated_by','updated_at'],
    vc_security_events: ['event_id','username_digest','status','created_at']
  };
  const ERR = new Set(['#VALUE!','#REF!','#DIV/0!','#N/A','#NAME?','#NUM!','#NULL!','#ERROR!']);
  function parseCSV(t) {
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"') { if (t[i+1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else { if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c === '\r') {} else f += c; }
    }
    if (f.length || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  const names = Object.keys(schema);
  const fetched = await Promise.all(names.map(async name => {
    const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return { name, fetchStatus: res.status };
    return { name, rows: parseCSV(await res.text()) };
  }));
  const S = {}; const perSheet = [];
  for (const r of fetched) {
    if (r.fetchStatus) { perSheet.push({ name: r.name, fetchStatus: r.fetchStatus }); continue; }
    const cols = schema[r.name], rows = r.rows, header = rows[0] || [];
    const headerOk = cols.every((c, i) => header[i] === c);
    const trailingCols = Math.max(0, header.length - cols.length);
    const trailingNonEmpty = header.slice(cols.length).filter(x => x !== '').length;
    const data = rows.slice(1).filter(x => x.some(c => c !== ''));
    const errorCells = [];
    for (let ri = 0; ri < data.length; ri++) for (let ci = 0; ci < cols.length; ci++) {
      const v = data[ri][ci];
      if (ERR.has(String(v))) errorCells.push({ cell: String.fromCharCode(65 + ci) + (ri + 2), column: cols[ci], value: String(v) });
    }
    S[r.name] = { cols, data };
    perSheet.push({ name: r.name, rows: data.length, headerOk, trailingCols, trailingNonEmpty, errorCount: errorCells.length, errorCells: errorCells.slice(0, 6) });
  }
  const idx = (t, c) => S[t].cols.indexOf(c);
  const col = (t, c) => S[t].data.map(r => r[idx(t, c)]);
  const keySet = (t, c) => new Set(col(t, c));
  // Logical FK rules. Sentinels (e.g. NO_MATCH for failed lookups) are not real FK values.
  const FK = [
    ['vc_vehicle_contacts','vehicle_id','vc_vehicles','vehicle_id',[]],
    ['vc_vehicle_photos','vehicle_id','vc_vehicles','vehicle_id',[]],
    ['vc_qr_tokens','vehicle_id','vc_vehicles','vehicle_id',[]],
    ['vc_registration_requests','vehicle_id','vc_vehicles','vehicle_id',[]],
    ['vc_change_requests','vehicle_id','vc_vehicles','vehicle_id',[]],
    ['vc_retention_jobs','vehicle_id','vc_vehicles','vehicle_id',[]],
    ['vc_lookup_audit','vehicle_id','vc_vehicles','vehicle_id',['NO_MATCH']],
    ['vc_user_roles','user_id','vc_users','user_id',[]],
    ['vc_user_roles','role_id','vc_roles','role_id',[]],
    ['vc_user_identities','user_id','vc_users','user_id',[]],
    ['vc_sessions','user_id','vc_users','user_id',[]],
    ['vc_photo_staging','campaign_id','vc_campaigns','campaign_id',[]],
    ['vc_organizations','parent_id','vc_organizations','organization_id',[]]
  ];
  const fkChecks = FK.map(([ct, cc, pt, pc, sentinels]) => {
    const parent = keySet(pt, pc);
    const all = col(ct, cc);
    const sent = all.filter(v => sentinels.includes(v)).length;
    const vals = all.filter(v => v !== '' && !sentinels.includes(v));
    const orph = vals.filter(v => !parent.has(v));
    return { child: ct + '.' + cc, parent: pt + '.' + pc, checked: vals.length, sentinelCount: sent, orphanCount: orph.length, orphanSample: [...new Set(orph)].slice(0, 4) };
  });
  const v = S.vc_vehicles, vi = c => idx('vc_vehicles', c);
  const statusCounts = {};
  for (const r of v.data) { const s = r[vi('status')] || '(blank)'; statusCounts[s] = (statusCounts[s] || 0) + 1; }
  const active = v.data.filter(r => r[vi('status')] === 'ACTIVE');
  const C = S.vc_vehicle_contacts, P = S.vc_vehicle_photos, Q = S.vc_qr_tokens, R = S.vc_registration_requests;
  const fixtures = active.map(r => {
    const vid = r[vi('vehicle_id')];
    return {
      plate: r[vi('plate_normalized')],
      contacts: C.data.filter(x => x[idx('vc_vehicle_contacts','vehicle_id')] === vid).length,
      photos: P.data.filter(x => x[idx('vc_vehicle_photos','vehicle_id')] === vid).length,
      qr: Q.data.filter(x => x[idx('vc_qr_tokens','vehicle_id')] === vid).length,
      regApproved: R.data.filter(x => x[idx('vc_registration_requests','vehicle_id')] === vid && x[idx('vc_registration_requests','status')] === 'APPROVED').length
    };
  });
  const referencedRoles = [...new Set(col('vc_user_roles','role_id'))];
  const rolesSheetRows = S.vc_roles.data.length;
  return {
    auditedAt: new Date().toISOString(),
    auditedSheets: perSheet.length,
    totalErrors: perSheet.reduce((n, s) => n + (s.errorCount || 0), 0),
    headerFails: perSheet.filter(s => s.headerOk === false).map(s => s.name),
    fetchFails: perSheet.filter(s => s.fetchStatus).map(s => s.name + ':' + s.fetchStatus),
    vehicleStatusCounts: statusCounts,
    activeVehicleCount: active.length,
    fixtures,
    fkChecks,
    rbac: {
      referencedRoles, rolesSheetRows,
      rolePermRows: S.vc_role_permissions.data.length,
      userPermRows: S.vc_user_permissions.data.length,
      rolesCodeCatalogLikely: rolesSheetRows === 0 && referencedRoles.length > 0
    },
    perSheet
  };
}