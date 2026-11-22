import {vehicleBusinessKey,validateFivePhotos,assertVehicleTransition} from '../../domain/policies/VehicleLifecycle.js';
import {paginate} from '../pagination/Pagination.js';
export function createVehicleOperations({store,security,campaigns,references}) {
 const need=(v,name,max=200)=>{if(typeof v!=='string'||!v.trim()||v.length>max||/^[=+@]/.test(v.trim()))throw new Error('INVALID_'+name);return v.trim();};
 const now=()=>security.now(),id=()=>security.secretToken();
 const phone=v=>{if(typeof v!=='string'||!/^\+[1-9][0-9]{6,14}$/.test(v))throw new Error('INVALID_PHONE_E164');return v;};
 const audit=(actor,kind,entity,action,identity={})=>store.insert('vc_change_audit',{
  audit_id:identity.auditId||id(),actor_id:actor&&actor.userId||'PUBLIC_CAMPAIGN',entity_type:kind,entity_id:entity,
  action,redacted_summary:action,correlation_id:identity.correlationId||id().slice(0,16),created_at:now()
 });
 const latestJournal=(operation,entityId)=>store.listNewest('vc_operation_journal',{operation,entity_id:entityId},20).at(-1)||null;
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
    if(store.list('vc_vehicles').some(v=>v.vehicle_id!==request.vehicle_id&&v.plate_normalized===app.plate_normalized&&v.province_code===app.province_code&&v.status==='ACTIVE'))throw new Error('DUPLICATE_VEHICLE');
    store.insert('vc_vehicles',{vehicle_id:request.vehicle_id,plate_normalized:app.plate_normalized,province_code:app.province_code,
     vehicle_type:app.vehicle_type,make:app.make,model:app.model,color:app.color,status:'ACTIVE',version:1,
     created_at:now(),updated_at:now(),created_by:detail.actorId,updated_by:detail.actorId,plate_type:app.plate_type,organization_id:app.organization_id});
    store.insert('vc_vehicle_contacts',{contact_id:detail.contactId,vehicle_id:request.vehicle_id,display_name:app.contactName,phone_e164:app.contactPhone,
     relationship:app.relationship,is_primary:true,status:'ACTIVE',verified_at:now(),created_at:now(),updated_at:now()});
    for(const f of app.photos)store.insert('vc_vehicle_photos',{photo_id:f.photoId,vehicle_id:request.vehicle_id,
     slot:f.slot,storage_ref:f.storageRef,mime_type:f.mimeType,size_bytes:f.sizeBytes,status:'ACTIVE',version:1,created_at:now()});
    const token=reviewToken(journal.event_id,request.request_id);
    store.insert('vc_qr_tokens',{qr_id:detail.qrId,vehicle_id:request.vehicle_id,token_digest:security.sha256(token),
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
 function lookupAudit(actor,vehicleId,source,result){
  store.sequence(()=>store.insert('vc_lookup_audit',{audit_id:id(),actor_id:actor.userId,vehicle_id:vehicleId,
   lookup_source:source,result,correlation_id:id().slice(0,16),created_at:now()}));
 }
 function activeVehicle(vehicleId){
  const row=store.one('vc_vehicles',{vehicle_id:need(vehicleId,'VEHICLE_ID')});
  if(!row||row.status!=='ACTIVE')throw new Error('VEHICLE_NOT_ACTIVE');
  return row;
 }
 const body=p=>({
  plate_normalized:vehicleBusinessKey(p.plate,p.province).split('|')[0],
  province_code:vehicleBusinessKey(p.plate,p.province).split('|')[1],
  plate_type:need(p.plateType,'PLATE_TYPE'),vehicle_type:need(p.vehicleType,'VEHICLE_TYPE'),
  make:need(p.brand,'BRAND'),model:need(p.model,'MODEL'),color:need(p.color,'COLOR'),
  organization_id:need(p.organizationId,'ORGANIZATION_ID'),relationship:need(p.relationship,'RELATIONSHIP'),
  contactName:need(p.contactName,'CONTACT_NAME'),contactPhone:phone(p.contactPhone)
 });
 function photos(p,campaignId){
  if(!validateFivePhotos(p.photos))throw new Error('FIVE_PHOTOS_REQUIRED');
  return p.photos.map(x=>{
   const file=store.one('vc_photo_staging',{photo_id:need(x.photoId,'PHOTO_ID')});
   if(!file||file.campaign_id!==campaignId||file.status!=='STAGED'||file.slot!==x.slot)throw new Error('PHOTO_NOT_STAGED');
   return file;
  });
 }
 function reconcileSubmitTimeout(idemKey){
  // A previous attempt may have died (GAS timeout/restart) after PREPARED but before the
  // idempotency commit, leaving an orphan application + CLAIMED photos. Reverse those partial
  // writes (single-table lookups, no cross-sheet join) so a retry can proceed. Campaign quota
  // cannot be proven incremented from state alone, so it is flagged for the manual runbook.
  const orphans=store.list('vc_registration_requests',{idempotency_key:idemKey},5);
  if(!orphans.length)return;
  let blocked=false;
  for(const orphan of orphans){
   const journal=store.one('vc_operation_journal',{entity_id:orphan.request_id,operation:'registrations.submit'});
   let photoIds=[];try{photoIds=(JSON.parse(orphan.application_json).photos||[]).map(f=>f.photoId);}catch{}
   const errors=[];const attempt=fn=>{try{fn();}catch(e){errors.push(String(e?.message||'RECOVERY_FAILED').slice(0,64));}};
   for(const pid of photoIds){const st=store.one('vc_photo_staging',{photo_id:pid});if(st&&st.status==='CLAIMED')attempt(()=>store.update('vc_photo_staging',{photo_id:pid},{status:'STAGED',used_at:''}));}
   let removed=false;attempt(()=>{store.remove('vc_registration_requests',{request_id:orphan.request_id});removed=true;});
   if(journal){let detail={};try{detail=JSON.parse(journal.detail_json);}catch{}
    attempt(()=>store.update('vc_operation_journal',{event_id:journal.event_id},{status:'RECOVERY_REQUIRED',
     detail_json:JSON.stringify({...detail,recovery:{requestRemoved:removed,photosRestored:photoIds,quotaCheck:'MANUAL',errors}})}));}
   if(errors.length)blocked=true;
  }
  if(blocked)throw new Error('OPERATION_RECOVERY_REQUIRED');
 }
 function registrationSubmit(p){
  const payload=body(p),key=payload.plate_normalized+'|'+payload.province_code;
  const idem=need(p.idempotencyKey,'IDEMPOTENCY_KEY',100);
  const digest=security.sha256(JSON.stringify({...p,campaignToken:undefined}));
  return store.withLock(()=>{
   references.assertRegistration(p);
   const campaign=campaigns.getCampaign(p.campaignToken,{requireCapacity:false});
   const idemKey=security.sha256('registration:'+campaign.campaign_id+':'+idem);
   const old=store.one('vc_idempotency',{key:idemKey});
   if(old){
    if(old.request_digest!==digest||old.status!=='COMPLETED')throw new Error('IDEMPOTENCY_CONFLICT');
    const result=JSON.parse(old.result_json);
    const j=store.one('vc_operation_journal',{entity_id:result.requestId,operation:'registrations.submit'});
    if(j&&j.status==='PREPARED'){try{store.update('vc_operation_journal',{event_id:j.event_id},{status:'APPLIED'});}catch{}}
    return result;
   }
   // A script timeout may interrupt a previous attempt before it writes the idempotency result.
   // Reconcile a timed-out partial attempt (remove orphan, restore photos) so a retry can proceed.
   // Ambiguous campaign quota is flagged RECOVERY_REQUIRED for the manual recovery runbook.
   reconcileSubmitTimeout(idemKey);
   if(Number(campaign.submitted_count)>=Number(campaign.max_submissions))throw new Error('CAMPAIGN_INVALID');
   const org=store.one('vc_organizations',{organization_id:payload.organization_id});
   if(!org||org.status!=='ACTIVE')throw new Error('ORGANIZATION_INACTIVE');
   const duplicate=store.list('vc_vehicles').some(v=>v.plate_normalized===payload.plate_normalized&&v.province_code===payload.province_code&&v.status!=='INACTIVE');
   if(duplicate||store.list('vc_registration_requests',{status:'PENDING_APPROVAL'}).some(r=>{
    const x=JSON.parse(r.application_json);return x.plate_normalized+'|'+x.province_code===key;
   }))throw new Error('DUPLICATE_VEHICLE');
   const media=photos(p,campaign.campaign_id),requestId=id(),vehicleId=id(),eventId=id();
   const snapshot={...payload,photos:media.map(f=>({photoId:f.photo_id,slot:f.slot,storageRef:f.storage_ref,mimeType:f.mime_type,sizeBytes:f.size_bytes}))};
   const journal={operation:'registrations.submit',requestId,vehicleId,campaignId:campaign.campaign_id,idempotencyKey:idemKey,requestDigest:digest};
   // PREPARED is persisted before applying writes. A timeout leaves evidence for manual recovery.
   store.insert('vc_operation_journal',{event_id:eventId,operation:'registrations.submit',entity_id:requestId,actor_id:'PUBLIC_CAMPAIGN',
    status:'PREPARED',detail_json:JSON.stringify(journal),created_at:now()});
   let requestWritten=false,claimed=[],quotaWritten=false,idemWritten=false;
   try {
    store.insert('vc_registration_requests',{request_id:requestId,vehicle_id:vehicleId,campaign_id:campaign.campaign_id,
     status:'PENDING_APPROVAL',submitted_at:now(),reviewed_by:'',reviewed_at:'',application_json:JSON.stringify(snapshot),idempotency_key:idemKey});
    requestWritten=true;
    for(const file of media){
     store.update('vc_photo_staging',{photo_id:file.photo_id},{status:'CLAIMED',used_at:now()});
     claimed.push(file.photo_id);
    }
    store.update('vc_campaigns',{campaign_id:campaign.campaign_id},{submitted_count:Number(campaign.submitted_count)+1});
    quotaWritten=true;
    const result={requestId,vehicleId,status:'PENDING_APPROVAL'};
    store.insert('vc_idempotency',{key:idemKey,operation:'registrations.submit',actor_id:'PUBLIC_CAMPAIGN',request_digest:digest,
     result_json:JSON.stringify(result),status:'COMPLETED',created_at:now()});
    idemWritten=true;
    store.update('vc_operation_journal',{event_id:eventId},{status:'APPLIED'});
    return result;
   } catch(error) {
    // Apps Script/Sheets cannot guarantee rollback on timeout. For caught errors,
    // compensate in reverse order under the same script lock and expose recovery state.
    const errors=[];
    const attempt=fn=>{try{fn();}catch(e){errors.push(String(e?.message||'COMPENSATION_FAILED').slice(0,64));}};
    if(idemWritten)attempt(()=>store.remove('vc_idempotency',{key:idemKey}));
    if(quotaWritten)attempt(()=>store.update('vc_campaigns',{campaign_id:campaign.campaign_id},{submitted_count:Number(campaign.submitted_count)}));
    for(const photoId of claimed.reverse())
     attempt(()=>store.update('vc_photo_staging',{photo_id:photoId},{status:'STAGED',used_at:''}));
    if(requestWritten)attempt(()=>store.remove('vc_registration_requests',{request_id:requestId}));
    attempt(()=>store.update('vc_operation_journal',{event_id:eventId},{
     status:errors.length?'RECOVERY_REQUIRED':'ROLLED_BACK',
     detail_json:JSON.stringify({...journal,recoveryErrors:errors})
    }));
    if(errors.length)throw new Error('OPERATION_RECOVERY_REQUIRED');
    throw error;
   }
  });
 }
 function registrationPending(p){
  const items=store.list('vc_registration_requests',{status:'PENDING_APPROVAL'})
   .map(r=>({requestId:r.request_id,vehicleId:r.vehicle_id,submittedAt:r.submitted_at,status:r.status}));
  return paginate(items,p,{defaultLimit:50,maxLegacyLimit:100});
 }
 function registrationDetail(p){
  const r=store.one('vc_registration_requests',{request_id:need(p.requestId,'REQUEST_ID')});
  if(!r)throw new Error('NOT_FOUND');
  return {requestId:r.request_id,status:r.status,application:JSON.parse(r.application_json),submittedAt:r.submitted_at};
 }
 function registrationReview(p,a){
  const requestId=need(p.requestId,'REQUEST_ID');
  if(!['APPROVE','REJECT'].includes(p.decision))throw new Error('INVALID_DECISION');
  return store.withLock(()=>{
   let r=store.one('vc_registration_requests',{request_id:requestId});
   if(!r)throw new Error('INVALID_REQUEST_STATE');
   const app=JSON.parse(r.application_json),decision=p.decision,previous=latestJournal('registrations.review',requestId),prior=parseJournal(previous);
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
    contactId:id(),qrId:decision==='APPROVE'?id():'',auditId:id(),correlationId:id().slice(0,16)};
   const journal={event_id:eventId,operation:'registrations.review',entity_id:requestId,actor_id:a.userId,
    status:'PREPARED',detail_json:JSON.stringify(detail),created_at:now()};
   store.insert('vc_operation_journal',journal);
   return applyReview(journal,detail,r,app);
  });
 }
 function vehicleView(v,actor,source) {
  if(!v||v.status!=='ACTIVE')return null;
  lookupAudit(actor,v.vehicle_id,source,'FOUND');
  const response={vehicleId:v.vehicle_id,plate:v.plate_normalized,province:v.province_code,status:v.status,
   vehicleType:v.vehicle_type,brand:v.make,model:v.model,color:v.color,version:Number(v.version)};
  if(actor.permissions.includes('vehicle.contact.read'))
   response.contacts=store.list('vc_vehicle_contacts',{vehicle_id:v.vehicle_id}).filter(c=>c.status==='ACTIVE')
    .map(c=>({name:c.display_name,phone:c.phone_e164,relationship:c.relationship,isPrimary:c.is_primary}));
  if(actor.permissions.includes('vehicle.photos.read'))
   response.photos=store.list('vc_vehicle_photos',{vehicle_id:v.vehicle_id}).filter(x=>x.status==='ACTIVE')
    .map(x=>({photoId:x.photo_id,slot:x.slot,storageRef:x.storage_ref,mimeType:x.mime_type}));
  return response;
 }
 function vehicleLookup(p,a){
  const [plate,province]=vehicleBusinessKey(p.plate,p.province).split('|');
  // Tolerate legacy rows whose numeric-looking province_code was coerced to a
  // number by Sheets before the text-preserving write fix; compare as strings.
  const list=store.list('vc_vehicles').filter(v=>String(v.plate_normalized)===plate&&String(v.province_code)===province&&String(v.status)==='ACTIVE');
  if(list.length>1)throw new Error('DUPLICATE_ACTIVE_VEHICLE');
  if(!list.length){lookupAudit(a,'NO_MATCH','PLATE','NOT_FOUND');return null;}
  return vehicleView(list[0],a,'PLATE');
 }
 function vehicleDetail(p,a){return vehicleView(activeVehicle(p.vehicleId),a,'DETAIL');}
 function vehicleHistory(p){const idValue=need(p.vehicleId,'VEHICLE_ID');return store.list('vc_change_audit',{entity_id:idValue}).slice(-100);}
 function vehicleUpdate(p,a){
  const idValue=need(p.vehicleId,'VEHICLE_ID');
  return store.withLock(()=>{
   const v=activeVehicle(idValue),version=Number(v.version);
   if(!Number.isInteger(p.expectedVersion)||p.expectedVersion!==version)throw new Error('VERSION_CONFLICT');
   const patch={updated_at:now(),updated_by:a.userId,version:version+1};
   for(const [client,field] of [['brand','make'],['model','model'],['color','color'],['plateType','plate_type'],['vehicleType','vehicle_type']]){
    if(p[client]!==undefined)patch[field]=need(p[client],client);
   }
   if(p.ownerUserId!==undefined){
    const owner=store.one('vc_users',{user_id:need(p.ownerUserId,'OWNER_USER_ID')});
    if(!owner||owner.status!=='ACTIVE')throw new Error('OWNER_NOT_FOUND');
    patch.owner_user_id=owner.user_id;
   }
   if(p.plate!==undefined||p.province!==undefined){
    const [plate,province]=vehicleBusinessKey(p.plate??v.plate_normalized,p.province??v.province_code).split('|');
    if(store.list('vc_vehicles').some(x=>x.vehicle_id!==idValue&&x.plate_normalized===plate&&x.province_code===province&&x.status==='ACTIVE'))
     throw new Error('DUPLICATE_VEHICLE');
    patch.plate_normalized=plate;patch.province_code=province;
   }
   store.update('vc_vehicles',{vehicle_id:idValue},patch);audit(a,'vehicle',idValue,'VEHICLE_UPDATED');
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
    store.update('vc_qr_tokens',{qr_id:q.qr_id},{status:'REVOKED',revoked_at:now()});
   store.insert('vc_retention_jobs',{job_id:id(),vehicle_id:vehicleId,due_at:new Date(Date.parse(now())+retention*86400000).toISOString(),
    status:'WAITING_RETENTION',approved_by:'',approved_at:'',attempts:0,last_error:'',legal_hold:false,created_at:now(),updated_at:now()});
   audit(a,'vehicle',vehicleId,'VEHICLE_CANCELLED');
   return {vehicleId,status:'INACTIVE'};
  });
 }
 function contactRead(p,a){
  const v=activeVehicle(p.vehicleId),list=store.list('vc_vehicle_contacts',{vehicle_id:v.vehicle_id}).filter(x=>x.status==='ACTIVE');
  lookupAudit(a,v.vehicle_id,'CONTACT','FOUND');return list.map(x=>({name:x.display_name,phone:x.phone_e164,relationship:x.relationship}));
 }
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
 function changeReview(p,a){
  const requestId=need(p.requestId,'REQUEST_ID');
  if(!['APPROVE','REJECT'].includes(p.decision))throw new Error('INVALID_DECISION');
  return store.withLock(()=>{
   const r=store.one('vc_change_requests',{change_id:requestId});
   if(!r||r.status!=='PENDING')throw new Error('INVALID_REQUEST_STATE');
   if(p.decision==='APPROVE'){
    const delta=JSON.parse(r.proposed_delta),v=activeVehicle(r.vehicle_id);
    const patch={updated_at:now(),updated_by:a.userId,version:Number(v.version)+1};
    for(const [client,field] of [['brand','make'],['model','model'],['color','color']])if(delta[client]!==undefined)patch[field]=delta[client];
    store.update('vc_vehicles',{vehicle_id:v.vehicle_id},patch);
    if(delta.contactName!==undefined||delta.contactPhone!==undefined){
     const c=store.list('vc_vehicle_contacts',{vehicle_id:v.vehicle_id}).find(x=>x.status==='ACTIVE'&&x.is_primary===true);
     if(!c)throw new Error('CONTACT_NOT_FOUND');
     const changes={updated_at:now()};
     if(delta.contactName!==undefined)changes.display_name=delta.contactName;
     if(delta.contactPhone!==undefined)changes.phone_e164=delta.contactPhone;
     store.update('vc_vehicle_contacts',{contact_id:c.contact_id},changes);
    }
   }
   store.update('vc_change_requests',{change_id:requestId},{status:p.decision==='APPROVE'?'APPROVED':'REJECTED',reviewed_by:a.userId,reviewed_at:now()});
   audit(a,'change',requestId,'CHANGE_'+p.decision);return {requestId,status:p.decision};
  });
 }
 function vehicleListMine(p,a){
  // OWNER-scoped read: filter strictly by the server session identity, never a client-supplied owner id.
  // Single bounded snapshot read; no cross-sheet join (minimal vehicle fields only).
  const items=store.list('vc_vehicles').filter(v=>String(v.owner_user_id)===String(a.userId)&&String(v.status)==='ACTIVE')
   .map(v=>({vehicleId:v.vehicle_id,plate:v.plate_normalized,province:v.province_code,vehicleType:v.vehicle_type,
    brand:v.make,model:v.model,color:v.color,status:v.status,version:Number(v.version)}));
  return paginate(items,p,{defaultLimit:50,maxLegacyLimit:100});
 }
 function vehicleList(p){
  // Admin registry read: all ACTIVE vehicles, minimal non-PII fields (no contacts, no owner id).
  // Single bounded snapshot read; no cross-sheet join. Gated by vehicle.list (admin roles only).
  const items=store.list('vc_vehicles').filter(v=>String(v.status)==='ACTIVE')
   .map(v=>({vehicleId:v.vehicle_id,plate:v.plate_normalized,province:v.province_code,vehicleType:v.vehicle_type,
    brand:v.make,model:v.model,color:v.color,status:v.status,version:Number(v.version),createdAt:v.created_at}));
  return paginate(items,p,{defaultLimit:50,maxLegacyLimit:100});
 }
 function changeListMine(p,a){
  const items=store.list('vc_change_requests').filter(r=>String(r.submitted_by)===String(a.userId))
   .map(r=>({requestId:r.change_id,vehicleId:r.vehicle_id,status:r.status,submittedAt:r.submitted_at,
    reviewedAt:r.reviewed_at,proposedDelta:JSON.parse(r.proposed_delta)}));
  return paginate(items,p,{defaultLimit:50,maxLegacyLimit:100});
 }
 function resolveQr(p,a){
  const token=need(p.token,'TOKEN');
  if(!/^[a-f0-9]{64}$/i.test(token))throw new Error('INVALID_QR');
  const qr=store.one('vc_qr_tokens',{token_digest:security.sha256(token.toLowerCase())});
  if(!qr||qr.status!=='ACTIVE'){lookupAudit(a,'NO_MATCH','QR','NOT_FOUND');return null;}
  const v=store.one('vc_vehicles',{vehicle_id:qr.vehicle_id});
  return vehicleView(v,a,'QR');
 }
 function manageQr(p,a,mode){
  const vehicleId=need(p.vehicleId,'VEHICLE_ID');
  return store.withLock(()=>{
   activeVehicle(vehicleId);
   const active=store.list('vc_qr_tokens',{vehicle_id:vehicleId}).filter(q=>q.status==='ACTIVE');
   if(active.length>1)throw new Error('MULTIPLE_ACTIVE_QR');
   if(mode==='issue'&&active.length)throw new Error('QR_ALREADY_ACTIVE');
   if(mode==='revoke'&&!active.length)return {vehicleId,revoked:false};
   for(const row of active)store.update('vc_qr_tokens',{qr_id:row.qr_id},{status:'REVOKED',revoked_at:now()});
   if(mode==='revoke'){audit(a,'qr',vehicleId,'QR_REVOKED');return {vehicleId,revoked:true};}
   const token=id(),qrId=id();
   store.insert('vc_qr_tokens',{qr_id:qrId,vehicle_id:vehicleId,token_digest:security.sha256(token),issued_at:now(),
    revoked_at:'',issued_by:a.userId,reason:mode==='replace'?'REPLACEMENT':'NEW',status:'ACTIVE'});
   audit(a,'qr',vehicleId,mode==='replace'?'QR_REPLACED':'QR_ISSUED');
   return {vehicleId,qrId,token};
  });
 }
 return Object.freeze({
  'registrations.submit':registrationSubmit,'registrations.listPending':registrationPending,
  'registrations.detail':registrationDetail,'registrations.review':registrationReview,
  'vehicles.lookup':vehicleLookup,'vehicles.detail':vehicleDetail,'vehicles.update':vehicleUpdate,
  'vehicles.cancel':vehicleCancel,'vehicles.history':vehicleHistory,'vehicles.listMine':vehicleListMine,'vehicles.list':vehicleList,
  'contacts.read':contactRead,'contacts.update':contactUpdate,
  'changes.submit':changeSubmit,'changes.listPending':changePending,'changes.review':changeReview,'changes.listMine':changeListMine,
  'qr.resolve':resolveQr,'qr.issue':(p,a)=>manageQr(p,a,'issue'),
  'qr.revoke':(p,a)=>manageQr(p,a,'revoke'),'qr.replace':(p,a)=>manageQr(p,a,'replace')
 });
}
