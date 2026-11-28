// N2 (VC-ADR-051): photos, retention and audit as native async use cases on the core — photos.list / photos.replace,
// retention.listDue / listExecutable / approve / jobStatus / execute, audit.query / audit.export. Same behaviour as the legacy
// MediaRetentionOperations (the legacy acceptance tests run through the core as generated copies, incl. the partial-delete
// recovery DSEQ09-03). Independent reads are one parallel round; a write + its audit row are one commit.
// retention.execute deletes rows permanently: it stays OFF unless the composition root enables it (as the legacy engine:
// VEHICLE_RETENTION_EXECUTE_ENABLED, not set on Cloud Run) — the core does not change who may delete or when.
import {pageWindow, pageOf, paginate} from '../../../gas/src/application/pagination/Pagination.js';
import {runFlowAsync} from '../../../gas/src/application/flows/FlowRunner.js';
import {organizeVehiclePhotosFlow} from '../../../gas/src/application/flows/PhotoLayoutFlow.js';
import {photoLinks} from '../../../gas/src/domain/policies/PhotoLayout.js';
import {PHOTO_POLICY_KEY, readPhotoPolicy, checkPhotoSize} from '../../../gas/src/domain/policies/PhotoPolicy.js';
import {PHOTO_SLOTS} from '../../../gas/src/domain/policies/VehicleLifecycle.js';

const PAGE_OPTIONS = {defaultLimit: 50, maxLegacyLimit: 100};

const need = (v, name) => { if (typeof v !== 'string' || !v.trim() || v.length > 256) throw new Error('INVALID_' + name); return v.trim(); };
const auditRow = (id, at, actor, kind, entity, action) => ({op: 'insert', table: 'vc_change_audit', data: {audit_id: id(),
  actor_id: actor && actor.userId || 'PUBLIC_CAMPAIGN', entity_type: kind, entity_id: entity, action, redacted_summary: action,
  correlation_id: id().slice(0, 16), created_at: at}});
const held = j => j.legal_hold === true || String(j.legal_hold) === 'true';
const policyRead = {kind: 'one', name: 'vc_settings', filter: {key: PHOTO_POLICY_KEY}};

export async function photosList(p, _a, {store}) {
  const vehicleId = need(p.vehicleId, 'VEHICLE_ID');
  const [vehicle, policyRow, photos] = await store.readMany([
    {kind: 'one', name: 'vc_vehicles', filter: {vehicle_id: vehicleId}}, policyRead,
    {kind: 'list', name: 'vc_vehicle_photos', filter: {vehicle_id: vehicleId}}]);
  if (!vehicle || vehicle.status !== 'ACTIVE') throw new Error('VEHICLE_NOT_ACTIVE');
  const policy = readPhotoPolicy(policyRow);
  return (photos || []).filter(x => x.status === 'ACTIVE')
    .map(x => ({photoId: x.photo_id, slot: x.slot, storageRef: x.storage_ref, mimeType: x.mime_type, ...photoLinks(x.storage_ref, policy)}));
}

// photos.replace: size rules before any Drive write; the new file → the slot row + audit in one commit; a failed commit
// trashes the new file; the old file is trashed after the commit (a failure there is journaled for the cleanup)
export async function photosReplace(p, actor, {store, now, id, media}) {
  const vehicleId = need(p.vehicleId, 'VEHICLE_ID'), slot = need(p.slot, 'SLOT');
  if (!PHOTO_SLOTS.includes(slot)) throw new Error('INVALID_SLOT');
  const [vehicle, policyRow] = await store.readMany([{kind: 'one', name: 'vc_vehicles', filter: {vehicle_id: vehicleId}}, policyRead]);
  if (!vehicle || vehicle.status !== 'ACTIVE') throw new Error('VEHICLE_NOT_ACTIVE');
  checkPhotoSize(p.base64Image, readPhotoPolicy(policyRow)); // VC-ADR-049, before any Drive write
  if (!media) throw new Error('MEDIA_NOT_CONFIGURED');
  const file = await media.upload(p.base64Image, p.mimeType);
  let oldStorage = null;
  try {
    const existing = (await store.list('vc_vehicle_photos', {vehicle_id: vehicleId})).filter(x => x.slot === slot && x.status === 'ACTIVE');
    if (existing.length !== 1) throw new Error('PHOTO_SLOT_INVARIANT');
    oldStorage = existing[0].storage_ref;
    await store.writeMany([{op: 'update', table: 'vc_vehicle_photos', key: {photo_id: existing[0].photo_id},
      fields: {storage_ref: file.storage_ref, mime_type: file.mime_type, size_bytes: file.size_bytes, version: Number(existing[0].version) + 1}},
    auditRow(id, now(), actor, 'photo', vehicleId, 'PHOTO_REPLACED')]);
  } catch (e) { try { await media.trash(file.storage_ref); } catch { /* the error below stands */ } throw e; }
  if (oldStorage) {
    try { await media.trash(oldStorage); } catch {
      await store.insert('vc_operation_journal', {event_id: id(), operation: 'photos.replace', entity_id: vehicleId, actor_id: actor.userId,
        status: 'OLD_FILE_CLEANUP_REQUIRED', detail_json: JSON.stringify({storageRef: oldStorage}), created_at: now()});
    }
  }
  // VC-ADR-050: the new file joins the vehicle's folder as <SLOT>.<ext> (best effort)
  if (typeof media.organize === 'function') try { await runFlowAsync(organizeVehiclePhotosFlow(vehicleId), {store, media}); } catch { /* best effort */ }
  return {vehicleId, slot, replaced: true};
}

export async function retentionListDue(p, _a, {store, now}) {
  const cutoff = Date.parse(now());
  const items = (await store.list('vc_retention_jobs', {status: 'WAITING_RETENTION'}))
    .filter(j => j.status === 'WAITING_RETENTION' && Date.parse(j.due_at) <= cutoff && !held(j))
    .map(j => ({jobId: j.job_id, vehicleId: j.vehicle_id, dueAt: j.due_at, status: j.status}));
  return paginate(items, p, PAGE_OPTIONS);
}
// RETENTION_WORKER-scoped read: only jobs the worker may execute (approved / failed, approved by someone, due, no hold)
export async function retentionListExecutable(p, _a, {store, now}) {
  const cutoff = Date.parse(now());
  const items = (await store.list('vc_retention_jobs'))
    .filter(j => ['DELETION_APPROVED', 'DELETION_FAILED'].includes(j.status) && j.approved_by && Date.parse(j.due_at) <= cutoff && !held(j))
    .map(j => ({jobId: j.job_id, vehicleId: j.vehicle_id, dueAt: j.due_at, status: j.status, attempts: Number(j.attempts), lastError: j.last_error}));
  return paginate(items, p, PAGE_OPTIONS);
}
export async function retentionApprove(p, actor, {store, now, id}) {
  const jobId = need(p.jobId, 'JOB_ID');
  const job = await store.one('vc_retention_jobs', {job_id: jobId});
  const at = now();
  if (!job || job.status !== 'WAITING_RETENTION' || Date.parse(job.due_at) > Date.parse(at) || held(job)) throw new Error('RETENTION_NOT_APPROVABLE');
  await store.writeMany([{op: 'update', table: 'vc_retention_jobs', key: {job_id: jobId},
    fields: {status: 'DELETION_APPROVED', approved_by: actor.userId, approved_at: at, updated_at: at}},
  auditRow(id, at, actor, 'retention', jobId, 'DELETION_APPROVED')]);
  return {jobId, approved: true};
}
export async function retentionJobStatus(p, _a, {store}) {
  const job = await store.one('vc_retention_jobs', {job_id: need(p.jobId, 'JOB_ID')});
  return job ? {jobId: job.job_id, vehicleId: job.vehicle_id, status: job.status, attempts: Number(job.attempts), lastError: job.last_error} : null;
}

const DELETE_KEYS = {vc_vehicle_photos: 'photo_id', vc_vehicle_contacts: 'contact_id', vc_qr_tokens: 'qr_id',
  vc_change_requests: 'change_id', vc_registration_requests: 'request_id'};
// retention.execute (RETENTION_WORKER): OFF unless enabled; an approved, due job without a hold → Drive files trashed, the
// vehicle's rows removed (change + lookup audits are kept, retained-evidence policy), job DELETION_COMPLETED; any failure →
// DELETION_FAILED + DELETION_RETRY_REQUIRED (the worker retries; the rows already removed stay removed, as the legacy)
export async function retentionExecute(p, actor, {store, now, id, media, retentionExecuteEnabled = false}) {
  if (!retentionExecuteEnabled) throw new Error('RETENTION_EXECUTION_DISABLED');
  const jobId = need(p.jobId, 'JOB_ID');
  const job = await store.one('vc_retention_jobs', {job_id: jobId});
  if (!job || !['DELETION_APPROVED', 'DELETION_FAILED'].includes(job.status) || !job.approved_by
    || Date.parse(job.due_at) > Date.parse(now()) || held(job)) throw new Error('DELETION_NOT_AUTHORIZED');
  await store.update('vc_retention_jobs', {job_id: jobId}, {status: 'DELETION_IN_PROGRESS', attempts: Number(job.attempts) + 1, updated_at: now()});
  try {
    const vehicleId = job.vehicle_id;
    if (!media) throw new Error('MEDIA_NOT_CONFIGURED');
    for (const photo of await store.list('vc_vehicle_photos', {vehicle_id: vehicleId})) await media.trash(photo.storage_ref);
    for (const [table, key] of Object.entries(DELETE_KEYS))
      for (const row of await store.list(table, {vehicle_id: vehicleId})) await store.remove(table, {[key]: row[key]});
    if (await store.one('vc_vehicles', {vehicle_id: vehicleId})) await store.remove('vc_vehicles', {vehicle_id: vehicleId});
    const at = now();
    await store.writeMany([{op: 'update', table: 'vc_retention_jobs', key: {job_id: jobId}, fields: {status: 'DELETION_COMPLETED', last_error: '', updated_at: at}},
      auditRow(id, at, actor, 'retention', jobId, 'DELETION_COMPLETED')]);
    return {jobId, status: 'DELETION_COMPLETED'};
  } catch (e) {
    await store.update('vc_retention_jobs', {job_id: jobId}, {status: 'DELETION_FAILED', last_error: String(e.message || 'FAILURE').slice(0, 120), updated_at: now()});
    throw new Error('DELETION_RETRY_REQUIRED');
  }
}

// audit.query (TUNEUP R1): the newest page*pageSize of each trail + a COUNT of each in ONE round; merged, cut to the page
export async function auditQuery(p, _a, {store}) {
  const w = pageWindow(p, PAGE_OPTIONS);
  const lf = p.vehicleId ? {vehicle_id: need(p.vehicleId, 'VEHICLE_ID')} : {}, cf = p.vehicleId ? {entity_id: need(p.vehicleId, 'VEHICLE_ID')} : {};
  const [l, c, ln, cn] = await store.readMany([{kind: 'newest', name: 'vc_lookup_audit', filter: lf, limit: w.n},
    {kind: 'newest', name: 'vc_change_audit', filter: cf, limit: w.n},
    {kind: 'count', name: 'vc_lookup_audit', filter: lf}, {kind: 'count', name: 'vc_change_audit', filter: cf}]);
  const lookup = (l || []).map(x => ({type: 'LOOKUP', eventId: x.audit_id, actorId: x.actor_id, vehicleId: x.vehicle_id, action: x.lookup_source, at: x.created_at}));
  const changes = (c || []).map(x => ({type: 'CHANGE', eventId: x.audit_id, actorId: x.actor_id, entityId: x.entity_id, action: x.action, at: x.created_at}));
  const items = [...lookup, ...changes].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return pageOf(items.slice(0, w.n), Number(ln) + Number(cn), w);
}
export async function auditExport(p, a, deps) {
  return {format: 'JSON', rows: await auditQuery({...(p.vehicleId ? {vehicleId: p.vehicleId} : {}), limit: 100}, a, deps)};
}
