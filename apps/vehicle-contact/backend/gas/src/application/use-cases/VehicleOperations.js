import {assertVehicleTransition,stickerCategory} from '../../domain/policies/VehicleLifecycle.js';
import {qrReason,QR_SYSTEM_REASONS} from '../../domain/policies/QrReasonPolicy.js';
import {paginate} from '../pagination/Pagination.js';
// TUNEUP R1: ACTIVE vehicles with this business key — an equality query (index plate_normalized+province_code+status).
const activeByPlate=(store,plate,province)=>store.list('vc_vehicles',{plate_normalized:String(plate),province_code:String(province),status:'ACTIVE'});
import {createChangeReview} from './ChangeReviewOperation.js';
import {createQrHistory} from './QrHistoryOperation.js';
import {createQrExport} from './QrExportOperation.js';
import {runFlowSync} from '../flows/FlowRunner.js';
import {vehicleHistoryFlow,vehicleLookupFlow,vehicleDetailFlow,contactReadFlow,qrResolveFlow} from '../flows/VehicleReadFlows.js';
import {registrationSubmitFlow} from '../flows/RegistrationSubmitFlow.js';
import {organizeVehiclePhotosFlow} from '../flows/PhotoLayoutFlow.js';
import {photoLinks} from '../../domain/policies/PhotoLayout.js';
import {PHOTO_POLICY_KEY,readPhotoPolicy} from '../../domain/policies/PhotoPolicy.js';
export function createVehicleOperations({store,security,campaigns,references,drivePhotos=null}) {
 const need=(v,name,max=200)=>{if(typeof v!=='string'||!v.trim()||v.length>max||/^[=+@]/.test(v.trim()))throw new Error('INVALID_'+name);return v.trim();};
 const now=()=>security.now(),id=()=>security.secretToken();
 const deps={now,id,sha256:x=>security.sha256(x)}; // what the shared flows need
 const phone=v=>{if(typeof v!=='string'||!/^\+[1-9][0-9]{6,14}$/.test(v))throw new Error('INVALID_PHONE_E164');return v;};
 const audit=(actor,kind,entity,action,identity={})=>store.insert('vc_change_audit',{
  audit_id:identity.auditId||id(),actor_id:actor&&actor.userId||'PUBLIC_CAMPAIGN',entity_type:kind,entity_id:entity,
  action,redacted_summary:action,correlation_id:identity.correlationId||id().slice(0,16),created_at:now()
 });
 // limit 1 = THE newest row under either port ordering (Sheets returns the window ascending,
 // Firestore descending; the old .at(-1) on a 20-row window picked the OLDEST on Firestore).
 const latestJournal=(operation,entityId)=>store.listNewest('vc_operation_journal',{operation,entity_id:entityId},1)[0]||null;
 const parseJournal=row=>{try{return JSON.parse(row?.detail_json||'{}');}catch{return {};}};
 const reviewStatus=decision=>decision==='APPROVE'?'APPROVED':'REJECTED';
 const reviewAction=decision=>decision==='APPROVE'?'REGISTRATION_APPROVED':'REGISTRATION_REJECTED';
 const reviewToken=(eventId,requestId)=>security.deriveSecret('registration-review:'+eventId+':'+requestId);
 function ensureReviewAudit(detail){
  if(!store.one('vc_change_audit',{audit_id:detail.auditId}))audit({userId:detail.actorId},'registration',detail.requestId,
   reviewAction(detail.decision),{auditId:detail.auditId,correlationId:detail.correlationId});
 }
 function reviewResult(request,journal,detail){
  const result={requestId:request.request_id,vehicleId:request.vehicle_id,status:reviewStatus(detail.decision)};
  if(detail.decision==='APPROVE'){
   const token=reviewToken(journal.event_id,request.request_id),qr=store.one('vc_qr_tokens',{qr_id:detail.qrId});
   if(!qr||qr.vehicle_id!==request.vehicle_id||qr.status!=='ACTIVE'||qr.token_digest!==security.sha256(token))throw new Error('OPERATION_RECOVERY_REQUIRED');
   result.qrToken=token;result.qrId=detail.qrId;
  }
  return result;
 }
 function completeReviewState(request,app,journal,detail){
  if(request.status!==reviewStatus(detail.decision))return false;
  if(detail.decision==='REJECT')return true;
  const vehicle=store.one('vc_vehicles',{vehicle_id:request.vehicle_id});
  const contacts=store.list('vc_vehicle_contacts',{vehicle_id:request.vehicle_id},10).filter(x=>x.status==='ACTIVE');
  const photos=store.list('vc_vehicle_photos',{vehicle_id:request.vehicle_id},10).filter(x=>x.status==='ACTIVE');
  const qr=store.one('vc_qr_tokens',{qr_id:detail.qrId}),token=reviewToken(journal.event_id,request.request_id);
  const expectedPhotos=(app.photos||[]).map(x=>x.photoId).sort(),actualPhotos=photos.map(x=>x.photo_id).sort();
  return !!vehicle&&vehicle.status==='ACTIVE'&&contacts.length===1
   &&JSON.stringify(expectedPhotos)===JSON.stringify(actualPhotos)
   &&!!qr&&qr.vehicle_id===request.vehicle_id&&qr.status==='ACTIVE'&&qr.token_digest===security.sha256(token);
 }
 function rollbackReviewPartial(request){
  const errors=[],attempt=fn=>{try{fn();}catch(error){errors.push(String(error?.message||'COMPENSATION_FAILED').slice(0,64));}};
  for(const row of store.list('vc_qr_tokens',{vehicle_id:request.vehicle_id},10))attempt(()=>store.remove('vc_qr_tokens',{qr_id:row.qr_id}));
  for(const row of store.list('vc_vehicle_photos',{vehicle_id:request.vehicle_id},10))attempt(()=>store.remove('vc_vehicle_photos',{photo_id:row.photo_id}));
  for(const row of store.list('vc_vehicle_contacts',{vehicle_id:request.vehicle_id},10))attempt(()=>store.remove('vc_vehicle_contacts',{contact_id:row.contact_id}));
  if(store.one('vc_vehicles',{vehicle_id:request.vehicle_id}))attempt(()=>store.remove('vc_vehicles',{vehicle_id:request.vehicle_id}));
  const current=store.one('vc_registration_requests',{request_id:request.request_id});
  if(current&&current.status!=='PENDING_APPROVAL')attempt(()=>store.update('vc_registration_requests',{request_id:request.request_id},{status:'PENDING_APPROVAL',reviewed_by:'',reviewed_at:''}));
  return errors;
 }
 function applyReview(journal,detail,request,app){
  let terminalApplied=false;
  try{
   if(detail.decision==='APPROVE'){
    if(activeByPlate(store,app.plate_normalized,app.province_code).some(v=>v.vehicle_id!==request.vehicle_id))throw new Error('DUPLICATE_VEHICLE');
    store.insert('vc_vehicles',{vehicle_id:request.vehicle_id,plate_normalized:app.plate_normalized,province_code:app.province_code,
     vehicle_type:app.vehicle_type,make:app.make,model:app.model,color:app.color,status:'ACTIVE',version:1,
     created_at:now(),updated_at:now(),created_by:detail.actorId,updated_by:detail.actorId,plate_type:app.plate_type,organization_id:app.organization_id,sticker_category:detail.stickerCategory||''});
    store.insert('vc_vehicle_contacts',{contact_id:detail.contactId,vehicle_id:request.vehicle_id,display_name:app.contactName,phone_e164:app.contactPhone,
     relationship:app.relationship,is_primary:true,status:'ACTIVE',verified_at:now(),created_at:now(),updated_at:now()});
    for(const f of app.photos)store.insert('vc_vehicle_photos',{photo_id:f.photoId,vehicle_id:request.vehicle_id,
     slot:f.slot,storage_ref:f.storageRef,mime_type:f.mimeType,size_bytes:f.sizeBytes,status:'ACTIVE',version:1,created_at:now()});
    const token=reviewToken(journal.event_id,request.request_id);
    store.insert('vc_qr_tokens',{qr_id:detail.qrId,vehicle_id:request.vehicle_id,token_digest:security.sha256(token),qr_token:token,
     issued_at:now(),revoked_at:'',issued_by:detail.actorId,reason:'REGISTRATION_APPROVED',status:'ACTIVE'});
   }
   store.update('vc_registration_requests',{request_id:request.request_id},{status:reviewStatus(detail.decision),reviewed_by:detail.actorId,reviewed_at:now()});
   terminalApplied=true;ensureReviewAudit(detail);
   store.update('vc_operation_journal',{event_id:journal.event_id},{status:'APPLIED'});
   return reviewResult(store.one('vc_registration_requests',{request_id:request.request_id}),journal,detail);
  }catch(error){
   if(terminalApplied){
    try{store.update('vc_operation_journal',{event_id:journal.event_id},{status:'RECOVERY_REQUIRED',detail_json:JSON.stringify({...detail,recovery:{stage:'TERMINAL_STATE_APPLIED'}})});}catch{}
    throw new Error('OPERATION_RECOVERY_REQUIRED');
   }
   const errors=rollbackReviewPartial(request);
   try{store.update('vc_operation_journal',{event_id:journal.event_id},{status:errors.length?'RECOVERY_REQUIRED':'ROLLED_BACK',
    detail_json:JSON.stringify({...detail,recovery:{stage:'REVIEW_WRITES',errors}})});}catch{errors.push('JOURNAL_UPDATE_FAILED');}
   if(errors.length)throw new Error('OPERATION_RECOVERY_REQUIRED');
   throw error;
  }
 }
 function activeVehicle(vehicleId){
  const row=store.one('vc_vehicles',{vehicle_id:need(vehicleId,'VEHICLE_ID')});
  if(!row||row.status!=='ACTIVE')throw new Error('VEHICLE_NOT_ACTIVE');
  return row;
 }
 // W1 (VC-ADR-028): read independent rows in ONE parallel round and apply every business
 // write in ONE commit. Firestore applies a commit all-or-nothing with per-write
 // preconditions, so there is never a partial submit to compensate (no saga, no locks).
 const readAll=reqs=>typeof store.readMany==='function'?store.readMany(reqs)
  :reqs.map(r=>r.kind==='one'?store.one(r.name,r.filter):r.kind==='versioned'?{row:store.one(r.name,r.filter),version:null}
   :r.kind==='newest'?store.listNewest(r.name,r.filter,r.limit||1):store.list(r.name,r.filter));
 const writeAll=ops=>{
  if(typeof store.writeMany==='function')return store.writeMany(ops);
  for(const o of ops){if(o.op==='insert')store.insert(o.table,o.data);else if(o.op==='update')store.update(o.table,o.key,o.fields);else store.remove(o.table,o.key);}
  return true;
 };
 const changeReview=createChangeReview({store,need,now,id,readAll,writeAll});
 // registrations.submit = the shared flow (application/flows/RegistrationSubmitFlow.js, phase 3 wave 2b); the reference rows
 // come from the same process memo as references.registration
 const registrationSubmit=p=>runFlowSync(registrationSubmitFlow(p,deps),{store,memo:references&&references.memo||null});
 function registrationPending(p){
  const items=store.list('vc_registration_requests',{status:'PENDING_APPROVAL'})
   .map(r=>({requestId:r.request_id,vehicleId:r.vehicle_id,submittedAt:r.submitted_at,status:r.status}));
  return paginate(items,p,{defaultLimit:50,maxLegacyLimit:100});
 }
 function registrationDetail(p){
  const r=store.one('vc_registration_requests',{request_id:need(p.requestId,'REQUEST_ID')});
  if(!r)throw new Error('NOT_FOUND');
  const application=JSON.parse(r.application_json),policy=readPhotoPolicy(store.one('vc_settings',{key:PHOTO_POLICY_KEY}));
  // VC-ADR-050 PR B: each evidence photo carries its Drive links (the reviewer's browser loads it directly)
  if(Array.isArray(application.photos))application.photos=application.photos.map(f=>({...f,...photoLinks(f.storageRef,policy)}));
  return {requestId:r.request_id,status:r.status,application,submittedAt:r.submitted_at};
 }
 function registrationReview(p,a){
  const requestId=need(p.requestId,'REQUEST_ID');
  if(!['APPROVE','REJECT'].includes(p.decision))throw new Error('INVALID_DECISION');
  // C4 (2026-11-24, live V62): APPROVE ∥ REJECT both committed (request update had no precondition)
  // → REJECTED request with an ACTIVE vehicle + QR. The request is now read WITH its version and the
  // commit is guarded by it; a WRITE_CONFLICT re-runs the review (replay same decision / refuse other).
  for(let attempt=1;;attempt++){
   let result;
   try{result=reviewOnce();}
   catch(error){if(!error||error.message!=='WRITE_CONFLICT')throw error;if(attempt>=3)throw new Error('BUSY');continue;}
   // VC-ADR-050: the approved vehicle's photos go into its own Drive folder (best effort: never undoes the approval)
   if(p.decision==='APPROVE'&&result&&result.vehicleId&&drivePhotos&&typeof drivePhotos.organize==='function')
    try{runFlowSync(organizeVehiclePhotosFlow(result.vehicleId),{store,media:drivePhotos});}catch(_){/* PR C's job catches up */}
   return result;
  }
  function reviewOnce(){
  return store.withLock(()=>{
   // W1: request + latest journal (+ vehicles for the duplicate check) in ONE parallel round.
   const decision=p.decision;
   let [versioned,journals,vehicles]=readAll([
    {kind:'versioned',name:'vc_registration_requests',filter:{request_id:requestId}},
    // Newest-first (DESC) query: the live DB only has the DESC composite index for this
    // filter; an ASC orderBy fails FAILED_PRECONDITION (the V57 regression).
    {kind:'newest',name:'vc_operation_journal',filter:{operation:'registrations.review',entity_id:requestId},limit:1},
    ...(decision==='APPROVE'?[{kind:'list',name:'vc_vehicles'}]:[])]);
   let r=versioned&&versioned.row;
   if(!r)throw new Error('INVALID_REQUEST_STATE');
   const app=JSON.parse(r.application_json),previous=journals[0]||null,prior=parseJournal(previous);
   if(decision==='APPROVE'&&p.platePhotoVerified!==true)throw new Error('PLATE_PHOTO_NOT_VERIFIED');
   if(previous&&['PREPARED','RECOVERY_REQUIRED'].includes(previous.status)){
    if(prior.decision!==decision)throw new Error('OPERATION_RECOVERY_REQUIRED');
    if(completeReviewState(r,app,previous,prior)){
     ensureReviewAudit(prior);store.update('vc_operation_journal',{event_id:previous.event_id},{status:'APPLIED'});
     return reviewResult(r,previous,prior);
    }
    const errors=rollbackReviewPartial(r);
    if(errors.length){
     try{store.update('vc_operation_journal',{event_id:previous.event_id},{status:'RECOVERY_REQUIRED',detail_json:JSON.stringify({...prior,recovery:{stage:'RESTART_CLEANUP',errors}})});}catch{}
     throw new Error('OPERATION_RECOVERY_REQUIRED');
    }
    r=store.one('vc_registration_requests',{request_id:requestId});
    if(!r||r.status!=='PENDING_APPROVAL')throw new Error('OPERATION_RECOVERY_REQUIRED');
    return applyReview(previous,prior,r,app);
   }
   if(previous&&previous.status==='APPLIED'&&prior.decision===decision){
    if(!completeReviewState(r,app,previous,prior))throw new Error('OPERATION_RECOVERY_REQUIRED');
    ensureReviewAudit(prior);return reviewResult(r,previous,prior);
   }
   if(r.status!=='PENDING_APPROVAL')throw new Error('INVALID_REQUEST_STATE');
   const eventId=id(),detail={operation:'registrations.review',requestId,vehicleId:r.vehicle_id,decision,actorId:a.userId,
    contactId:id(),qrId:decision==='APPROVE'?id():'',auditId:id(),correlationId:id().slice(0,16),stickerCategory:p.stickerCategory||app.sticker_category||''};
   return commitReview(eventId,detail,r,app,vehicles||[],versioned.version);
  });
  }
 }
 // W1 fresh review: every write in ONE all-or-nothing commit — nothing partial to compensate.
 // A concurrent approval of the same request collides on the vehicle/QR create preconditions,
 // so only one approval can ever land.
 function commitReview(eventId,detail,request,app,vehicles,requestVersion){
  const at=now(),approve=detail.decision==='APPROVE',token=approve?reviewToken(eventId,request.request_id):'';
  if(approve&&vehicles.some(v=>v.vehicle_id!==request.vehicle_id&&v.plate_normalized===app.plate_normalized&&v.province_code===app.province_code&&v.status==='ACTIVE'))
   throw new Error('DUPLICATE_VEHICLE');
  const writes=[{op:'insert',table:'vc_operation_journal',data:{event_id:eventId,operation:'registrations.review',entity_id:request.request_id,
   actor_id:detail.actorId,status:'APPLIED',detail_json:JSON.stringify(detail),created_at:at}}];
  if(approve){
   writes.push({op:'insert',table:'vc_vehicles',data:{vehicle_id:request.vehicle_id,plate_normalized:app.plate_normalized,province_code:app.province_code,
    vehicle_type:app.vehicle_type,make:app.make,model:app.model,color:app.color,status:'ACTIVE',version:1,
    created_at:at,updated_at:at,created_by:detail.actorId,updated_by:detail.actorId,plate_type:app.plate_type,organization_id:app.organization_id,sticker_category:detail.stickerCategory||''}});
   writes.push({op:'insert',table:'vc_vehicle_contacts',data:{contact_id:detail.contactId,vehicle_id:request.vehicle_id,display_name:app.contactName,
    phone_e164:app.contactPhone,relationship:app.relationship,is_primary:true,status:'ACTIVE',verified_at:at,created_at:at,updated_at:at}});
   for(const f of app.photos)writes.push({op:'insert',table:'vc_vehicle_photos',data:{photo_id:f.photoId,vehicle_id:request.vehicle_id,
    slot:f.slot,storage_ref:f.storageRef,mime_type:f.mimeType,size_bytes:f.sizeBytes,status:'ACTIVE',version:1,created_at:at}});
   writes.push({op:'insert',table:'vc_qr_tokens',data:{qr_id:detail.qrId,vehicle_id:request.vehicle_id,token_digest:security.sha256(token),qr_token:token,
    issued_at:at,revoked_at:'',issued_by:detail.actorId,reason:'REGISTRATION_APPROVED',status:'ACTIVE'}});
  }
  writes.push({op:'update',table:'vc_registration_requests',key:{request_id:request.request_id},
   fields:{status:reviewStatus(detail.decision),reviewed_by:detail.actorId,reviewed_at:at},...(requestVersion?{ifVersion:requestVersion}:{})});
  if(approve)writes.push({op:'insert',table:'vc_change_audit',data:{audit_id:detail.auditId+'-v',actor_id:detail.actorId,entity_type:'vehicle',
   entity_id:request.vehicle_id,action:'REGISTRATION_APPROVED',redacted_summary:'REGISTRATION_APPROVED',correlation_id:detail.correlationId,created_at:at}});
  writes.push({op:'insert',table:'vc_change_audit',data:{audit_id:detail.auditId,actor_id:detail.actorId,entity_type:'registration',
   entity_id:request.request_id,action:reviewAction(detail.decision),redacted_summary:reviewAction(detail.decision),
   correlation_id:detail.correlationId,created_at:at}});
  try{writeAll(writes);}
  // A create collision means a concurrent review of this request committed first: re-read
  // (WRITE_CONFLICT) so the same decision replays and a different one is refused.
  catch(error){if(error&&error.message==='DUPLICATE_KEY')throw new Error('WRITE_CONFLICT');throw error;}
  const result={requestId:request.request_id,vehicleId:request.vehicle_id,status:reviewStatus(detail.decision)};
  if(approve){result.qrToken=token;result.qrId=detail.qrId;}
  return result;
 }
 // officer-path reads: the shared flows (VC-ADR-046 phase 2b) — the Node core runs the same ones
 function vehicleLookup(p,a){return runFlowSync(vehicleLookupFlow(p,a,deps),{store});}
 // detail = view + Vehicle 360 + sticker (VC-ADR-036 S2, VC-ADR-038)
 function vehicleDetail(p,a){return runFlowSync(vehicleDetailFlow(p,a,deps),{store});}
 // vehicles.history: the shared flow (VC-ADR-046 phase 2b) — the Node core runs the same one
 function vehicleHistory(p){return runFlowSync(vehicleHistoryFlow(p),{store});}
 function vehicleUpdate(p,a){
  const idValue=need(p.vehicleId,'VEHICLE_ID');
  return store.withLock(()=>{
   // expectedVersion was checked against a read but the write had no precondition, so two
   // updates with the same expectedVersion could both land (lost update). Now ONE guarded commit.
   const [read]=readAll([{kind:'versioned',name:'vc_vehicles',filter:{vehicle_id:idValue}}]);
   const v=read&&read.row;if(!v||v.status!=='ACTIVE')throw new Error('VEHICLE_NOT_ACTIVE');
   const version=Number(v.version);
   if(!Number.isInteger(p.expectedVersion)||p.expectedVersion!==version)throw new Error('VERSION_CONFLICT');
   const patch={updated_at:now(),updated_by:a.userId,version:version+1};
   for(const [client,field] of [['brand','make'],['model','model'],['color','color'],['plateType','plate_type'],['vehicleType','vehicle_type']]){
    if(p[client]!==undefined)patch[field]=need(p[client],client);
   }
   if(p.stickerCategory!==undefined)patch.sticker_category=stickerCategory(p.stickerCategory);
   if(p.ownerUserId!==undefined){
    const owner=store.one('vc_users',{user_id:need(p.ownerUserId,'OWNER_USER_ID')});
    if(!owner||owner.status!=='ACTIVE')throw new Error('OWNER_NOT_FOUND');
    patch.owner_user_id=owner.user_id;
   }
   if(p.plate!==undefined||p.province!==undefined){
    const [plate,province]=vehicleBusinessKey(p.plate??v.plate_normalized,p.province??v.province_code).split('|');
    if(activeByPlate(store,plate,province).some(x=>x.vehicle_id!==idValue))
     throw new Error('DUPLICATE_VEHICLE');
    patch.plate_normalized=plate;patch.province_code=province;
   }
   try{writeAll([{op:'update',table:'vc_vehicles',key:{vehicle_id:idValue},fields:patch,...(read.version?{ifVersion:read.version}:{})},
    {op:'insert',table:'vc_change_audit',data:{audit_id:id(),actor_id:a.userId,entity_type:'vehicle',entity_id:idValue,action:'VEHICLE_UPDATED',
     redacted_summary:'VEHICLE_UPDATED',correlation_id:id().slice(0,16),created_at:now()}}]);}
   catch(error){if(error&&error.message==='WRITE_CONFLICT')throw new Error('VERSION_CONFLICT');throw error;}
   return {vehicleId:idValue,version:version+1};
  });
 }
 function vehicleCancel(p,a){
  const vehicleId=need(p.vehicleId,'VEHICLE_ID');
  return store.withLock(()=>{
   const v=activeVehicle(vehicleId);assertVehicleTransition(v.status,'INACTIVE');
   const retention=Number(store.one('vc_settings',{key:'retention_days'})?.value);
   if(!Number.isSafeInteger(retention)||retention<1)throw new Error('RETENTION_POLICY_NOT_CONFIGURED');
   store.update('vc_vehicles',{vehicle_id:vehicleId},{status:'INACTIVE',version:Number(v.version)+1,updated_at:now(),updated_by:a.userId});
   for(const q of store.list('vc_qr_tokens',{vehicle_id:vehicleId}).filter(x=>x.status==='ACTIVE'))
    store.update('vc_qr_tokens',{qr_id:q.qr_id},{status:'REVOKED',revoked_at:now(),revoked_by:a.userId,revoke_reason:QR_SYSTEM_REASONS.cancel,revoke_note:''});
   store.insert('vc_retention_jobs',{job_id:id(),vehicle_id:vehicleId,due_at:new Date(Date.parse(now())+retention*86400000).toISOString(),
    status:'WAITING_RETENTION',approved_by:'',approved_at:'',attempts:0,last_error:'',legal_hold:false,created_at:now(),updated_at:now()});
   audit(a,'vehicle',vehicleId,'VEHICLE_CANCELLED');
   return {vehicleId,status:'INACTIVE'};
  });
 }
 function contactRead(p,a){return runFlowSync(contactReadFlow(p,a,deps),{store});}
 function contactUpdate(p,a){
  const v=activeVehicle(p.vehicleId);
  return store.withLock(()=>{
   const list=store.list('vc_vehicle_contacts',{vehicle_id:v.vehicle_id}).filter(x=>x.status==='ACTIVE'&&x.is_primary===true);
   if(list.length!==1)throw new Error('PRIMARY_CONTACT_INVARIANT');
   const patch={updated_at:now()};
   if(p.contactName!==undefined)patch.display_name=need(p.contactName,'CONTACT_NAME');
   if(p.contactPhone!==undefined)patch.phone_e164=phone(p.contactPhone);
   if(Object.keys(patch).length===1)throw new Error('NO_CHANGES');
   store.update('vc_vehicle_contacts',{contact_id:list[0].contact_id},patch);audit(a,'vehicle',v.vehicle_id,'CONTACT_UPDATED');
   return {vehicleId:v.vehicle_id,updated:true};
  });
 }
 function changeSubmit(p,a){
  const v=activeVehicle(p.vehicleId);
  if(!a||!(v.owner_user_id===a.userId||a.permissions.includes('vehicle.update')))throw new Error('OWNERSHIP_NOT_VERIFIED');
  const delta={};
  for(const f of ['contactName','contactPhone','brand','model','color'])if(p[f]!==undefined)delta[f]=f==='contactPhone'?phone(p[f]):need(p[f],f);
  if(!Object.keys(delta).length)throw new Error('NO_CHANGES');
  const reqId=id();
  store.sequence(()=>{store.insert('vc_change_requests',{change_id:reqId,vehicle_id:v.vehicle_id,proposed_delta:JSON.stringify(delta),
   status:'PENDING',submitted_by:a.userId,submitted_at:now(),reviewed_by:'',reviewed_at:''});audit(a,'change',reqId,'CHANGE_SUBMITTED')});
  return {requestId:reqId,status:'PENDING'};
 }
 function changePending(p){
  const items=store.list('vc_change_requests',{status:'PENDING'})
   .map(r=>({requestId:r.change_id,vehicleId:r.vehicle_id,submittedAt:r.submitted_at,proposedDelta:JSON.parse(r.proposed_delta)}));
  return paginate(items,p,{defaultLimit:50,maxLegacyLimit:100});
 }
 // one list row shape for the owner's list and the admin registry (minimal, non-PII fields)
 const listRow=v=>({vehicleId:v.vehicle_id,plate:v.plate_normalized,province:v.province_code,vehicleType:v.vehicle_type,
  brand:v.make,model:v.model,color:v.color,stickerCategory:v.sticker_category||'',status:v.status,version:Number(v.version)});
 function vehicleListMine(p,a){
  // OWNER-scoped read: filter strictly by the server session identity, never a client-supplied owner id.
  // Single bounded snapshot read; no cross-sheet join (minimal vehicle fields only).
  const items=store.list('vc_vehicles',{owner_user_id:String(a.userId),status:'ACTIVE'})
   .map(listRow);
  return paginate(items,p,{defaultLimit:50,maxLegacyLimit:100});
 }
 // vehicles.list (admin registry / QR print, filters) lives in VehicleListOperations.js (VC-ADR-042)
 function changeListMine(p,a){
  const items=store.list('vc_change_requests',{submitted_by:String(a.userId)})
   .map(r=>({requestId:r.change_id,vehicleId:r.vehicle_id,status:r.status,submittedAt:r.submitted_at,
    reviewedAt:r.reviewed_at,proposedDelta:JSON.parse(r.proposed_delta)}));
  return paginate(items,p,{defaultLimit:50,maxLegacyLimit:100});
 }
 function resolveQr(p,a){return runFlowSync(qrResolveFlow(p,a,deps),{store});}
 function manageQr(p,a,mode){
  const vehicleId=need(p.vehicleId,'VEHICLE_ID');
  const why=qrReason(mode,p.reason,p.note); // VC-ADR-036: every QR change carries a reason
  return store.withLock(()=>{
   activeVehicle(vehicleId);
   const active=store.list('vc_qr_tokens',{vehicle_id:vehicleId}).filter(q=>q.status==='ACTIVE');
   if(active.length>1)throw new Error('MULTIPLE_ACTIVE_QR');
   if(mode==='issue'&&active.length)throw new Error('QR_ALREADY_ACTIVE');
   if(mode==='revoke'&&!active.length)return {vehicleId,revoked:false};
   for(const row of active)store.update('vc_qr_tokens',{qr_id:row.qr_id},{status:'REVOKED',revoked_at:now(),
    revoked_by:a.userId,revoke_reason:why.reason,revoke_note:why.note});
   if(mode==='revoke'){audit(a,'qr',vehicleId,'QR_REVOKED');return {vehicleId,revoked:true};}
   const token=id(),qrId=id();
   store.insert('vc_qr_tokens',{qr_id:qrId,vehicle_id:vehicleId,token_digest:security.sha256(token),qr_token:token,issued_at:now(),
    revoked_at:'',issued_by:a.userId,reason:why.reason,issue_note:why.note,
    replaces_qr_id:mode==='replace'&&active[0]?active[0].qr_id:'',status:'ACTIVE'});
   audit(a,'qr',vehicleId,mode==='replace'?'QR_REPLACED':'QR_ISSUED');
   return {vehicleId,qrId,token};
  });
 }
 const qrHistory=createQrHistory({store,need});
 const qrExport=createQrExport({store,need,id,now});
 return Object.freeze({
  'registrations.submit':registrationSubmit,'registrations.listPending':registrationPending,
  'registrations.detail':registrationDetail,'registrations.review':registrationReview,
  'vehicles.lookup':vehicleLookup,'vehicles.detail':vehicleDetail,'vehicles.update':vehicleUpdate,
  'vehicles.cancel':vehicleCancel,'vehicles.history':vehicleHistory,'vehicles.listMine':vehicleListMine,
  'contacts.read':contactRead,'contacts.update':contactUpdate,
  'changes.submit':changeSubmit,'changes.listPending':changePending,'changes.review':changeReview,'changes.listMine':changeListMine,
  'qr.resolve':resolveQr,'qr.issue':(p,a)=>manageQr(p,a,'issue'),'qr.history':qrHistory,'qr.export':qrExport,
  'qr.revoke':(p,a)=>manageQr(p,a,'revoke'),'qr.replace':(p,a)=>manageQr(p,a,'replace')
 });
}
