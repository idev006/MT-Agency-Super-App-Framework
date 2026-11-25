// Residue purge classification (owner 2026-11-25). Pure: decides WHICH ids a dry run lists;
// nothing here touches Firestore. Real rows, the admin, reference data and settings are kept.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classify, isSyntheticUserRow, STAGING_TTL_DAYS, PURGE_GATE, main} from '../scripts/purge-synthetic-residue.mjs';

const NOW = Date.parse('2026-11-25T00:00:00Z'), old = '2026-11-01T00:00:00Z', fresh = '2026-11-24T00:00:00Z';
const rows = {
  vc_vehicles: [{vehicle_id: 'vs', plate_normalized: 'TST1', make: 'X'}, {vehicle_id: 'vr', plate_normalized: 'ฮฮ1', make: 'TOYOTA'}],
  vc_registration_requests: [{request_id: 'r1', vehicle_id: 'vs'}, {request_id: 'r2', vehicle_id: '', application_json: JSON.stringify({plate_normalized: 'ฑฆ9'})},
    {request_id: 'r3', vehicle_id: 'vr', application_json: '{}'}],
  vc_vehicle_photos: [{photo_id: 'p1', vehicle_id: 'vs', storage_ref: 'f1'}, {photo_id: 'p2', vehicle_id: 'vr', storage_ref: 'f2'}],
  vc_vehicle_contacts: [{contact_id: 'c1', vehicle_id: 'vs'}],
  vc_change_audit: [{audit_id: 'a1', entity_id: 'vs'}, {audit_id: 'a2', entity_id: 'u-admin'}],
  vc_users: [{user_id: 'u-admin', username_normalized: 'admin'}, {user_id: 'u-t', username_normalized: 'p6vc_staff_x'}, {user_id: 'u-d', username_normalized: 'x', display_name: 'P6VC Automated reg'}],
  vc_user_roles: [{assignment_id: 'ra', user_id: 'u-admin'}, {assignment_id: 'rt', user_id: 'u-t'}],
  vc_sessions: [{session_id: 's-live', user_id: 'u-admin', status: 'ACTIVE', expires_at: '2026-12-01T00:00:00Z'},
    {session_id: 's-old', user_id: 'u-admin', status: 'ACTIVE', expires_at: old}, {session_id: 's-rev', user_id: 'u-admin', status: 'REVOKED', expires_at: '2026-12-01T00:00:00Z'}],
  vc_photo_staging: [{photo_id: 'p1', status: 'CLAIMED', created_at: old, storage_ref: 'f1'}, {photo_id: 'st-old', status: 'STAGED', created_at: old, storage_ref: 'f3'},
    {photo_id: 'st-new', status: 'STAGED', created_at: fresh, storage_ref: 'f4'}, {photo_id: 'p2', status: 'CLAIMED', created_at: old, storage_ref: 'f2'}],
  vc_reference_values: [{reference_id: 'REF-1'}], vc_settings: [{key: 'k'}],
};

test('RES-01 synthetic vehicles and everything linked to them; real vehicles kept', () => {
  const {ids, kept} = classify(rows, {now: NOW, adminUsername: 'admin'});
  assert.deepEqual(ids.vc_vehicles, ['vs']);
  assert.deepEqual(ids.vc_registration_requests, ['r1', 'r2'], 'rejected synthetic request found by its plate');
  assert.deepEqual(ids.vc_vehicle_photos, ['p1']); assert.deepEqual(ids.vc_vehicle_contacts, ['c1']); assert.deepEqual(ids.vc_change_audit, ['a1']);
  assert.equal(kept.vc_vehicles, 1); assert.equal(kept.vc_reference_values, 1); assert.equal(kept.vc_settings, 1);
});

test('RES-02 synthetic users go; the admin, its roles and its live session stay; dead sessions go', () => {
  const {ids} = classify(rows, {now: NOW, adminUsername: 'admin'});
  assert.deepEqual(ids.vc_users, ['u-d', 'u-t']); assert.deepEqual(ids.vc_user_roles, ['rt']);
  assert.deepEqual(ids.vc_sessions, ['s-old', 's-rev']);
  assert.equal(isSyntheticUserRow({username_normalized: 'p6vc_x'}, 'p6vc_x'), false, 'the configured admin is never synthetic');
});

test(`RES-03 unclaimed-upload rule: STAGED older than ${STAGING_TTL_DAYS} days + staging of purged photos; their Drive refs are listed`, () => {
  const {ids, driveRefs} = classify(rows, {now: NOW, adminUsername: 'admin'});
  assert.deepEqual(ids.vc_photo_staging, ['p1', 'st-old']);
  assert.deepEqual(driveRefs, ['f1', 'f3'], 'f2 (real vehicle) and f4 (recent upload) are kept');
});

test('RES-04 --apply refuses without the exact gate (no reads, no deletes)', async () => {
  // the gate is checked before credentials are even loaded (a missing key file would otherwise throw)
  assert.deepEqual(await main({env: {GOOGLE_APPLICATION_CREDENTIALS: 'missing.json'}, argv: ['--apply', 'x.json']}), {mode: 'BLOCKED', reason: 'MISSING_PURGE_GATE'});
  assert.equal(PURGE_GATE, 'PURGE_SYNTHETIC_RESIDUE');
});

import {classifyInit, MASTER_TABLES, isSyntheticOrgRow} from '../scripts/purge-synthetic-residue.mjs';
test('RES-05 init keeps only master tables, the admin account and real organizations', () => {
  const r = {...rows, vc_organizations: [{organization_id: 'o-real', name: 'หน่วยงานทดสอบ P6'}, {organization_id: 'o-t', name: 'P6VC Reset x'}, {organization_id: 'o-p', name: 'CR probe org 1'}],
    vc_campaigns: [{campaign_id: 'cp1'}], vc_idempotency: [{key: 'k1'}], vc_roles: [{role_id: 'R'}]};
  const {ids, kept} = classifyInit(r, {now: NOW, adminUsername: 'admin'});
  assert.deepEqual(ids.vc_vehicles, ['vr', 'vs'], 'every vehicle, real-looking ones too');
  assert.deepEqual(ids.vc_users, ['u-d', 'u-t']); assert.deepEqual(ids.vc_user_roles, ['rt']);
  assert.deepEqual(ids.vc_sessions, ['s-old', 's-rev'], "the admin's live session stays");
  assert.deepEqual(ids.vc_organizations, ['o-p', 'o-t']); assert.deepEqual(ids.vc_campaigns, ['cp1']); assert.deepEqual(ids.vc_idempotency, ['k1']);
  for (const t of MASTER_TABLES) assert.equal(ids[t], undefined, t + ' is master');
  assert.equal(kept.vc_reference_values, 1); assert.equal(kept.vc_users, 1); assert.equal(kept.vc_organizations, 1);
  assert.throws(() => classifyInit(r, {adminUsername: 'nobody'}), /ADMIN_NOT_FOUND/);
  assert.throws(() => classifyInit(r, {}), /ADMIN_USERNAME_REQUIRED/);
  assert.equal(isSyntheticOrgRow({name: 'หน่วยงานทดสอบ P6'}), false);
});
