import {paginate,pageWindow,pageOf} from '../pagination/Pagination.js';
import {runFlowSync} from '../flows/FlowRunner.js';
import {vehiclePhotoFlow} from '../flows/VehicleReadFlows.js';
import {photoUploadFlow} from '../flows/RegistrationFlows.js';
import {PHOTO_POLICY_KEY,readPhotoPolicy,checkPhotoSize} from '../../domain/policies/PhotoPolicy.js';
export function createMediaRetentionOperations({store,security,drivePhotos,campaigns,allowDestructiveRetention=false}) {
 const need=(v,name)=>{if(typeof v!=='string'||!v.trim()||v.length>256)throw new Error('INVALID_'+name);return v.trim();};
 const now=()=>security.now(),id=()=>security.secretToken();
 const audit=(actor,kind,entity,action)=>store.insert('vc_change_audit',{
  audit_id:id(),actor_id:actor&&actor.userId||'PUBLIC_CAMPAIGN',entity_type:kind,entity_id:entity,action,
  redacted_summary:action,correlation_id:id().slice(0,16),created_at:now()
 });
 // photos.upload = the shared flow (application/flows/RegistrationFlows.js, phase 3 wave 2a)
 const uploadPhoto=p=>runFlowSync(photoUploadFlow(p,{now,id,sha256:x=>security.sha256(x)}),{store,media:drivePhotos});
 function photosList(p) {
  const vehicleId=need(p.vehicleId,'VEHICLE_ID');
  const vehicle=store.one('vc_vehicles',{vehicle_id:vehicleId});
  if(!vehicle||vehicle.status!=='ACTIVE')throw new Error('VEHICLE_NOT_ACTIVE');
  return store.list('vc_vehicle_photos',{vehicle_id:vehicleId}).filter(x=>x.status==='ACTIVE')
   .map(x=>({photoId:x.photo_id,slot:x.slot,storageRef:x.storage_ref,mimeType:x.mime_type}));
 }
 function replacePhoto(p,actor){
  const vehicleId=need(p.vehicleId,'VEHICLE_ID'),slot=need(p.slot,'SLOT');
  if(!['FRONT','REAR','LEFT','RIGHT','FRONT_ANGLE'].includes(slot))throw new Error('INVALID_SLOT');
  const vehicle=store.one('vc_vehicles',{vehicle_id:vehicleId});
  if(!vehicle||vehicle.status!=='ACTIVE')throw new Error('VEHICLE_NOT_ACTIVE');
  checkPhotoSize(p.base64Image,readPhotoPolicy(store.one('vc_settings',{key:PHOTO_POLICY_KEY}))); // VC-ADR-049, before any Drive write
  const media=drivePhotos.upload(p.base64Image,p.mimeType);
  let oldStorage=null;
  try {
   store.withLock(()=>{
    const existing=store.list('vc_vehicle_photos',{vehicle_id:vehicleId}).filter(x=>x.slot===slot&&x.status==='ACTIVE');
    if(existing.length!==1)throw new Error('PHOTO_SLOT_INVARIANT');
    oldStorage=existing[0].storage_ref;
    store.update('vc_vehicle_photos',{photo_id:existing[0].photo_id},{
     storage_ref:media.storage_ref,mime_type:media.mime_type,size_bytes:media.size_bytes,version:Number(existing[0].version)+1});
    audit(actor,'photo',vehicleId,'PHOTO_REPLACED');
   });
  }catch(e){try{drivePhotos.trash(media.storage_ref);}catch(_){}throw e;}
  // Once replacement is persisted, retire the old publicly linkable file.
  if(oldStorage)try{drivePhotos.trash(oldStorage);}catch(_){
   store.sequence(()=>store.insert('vc_operation_journal',{event_id:id(),operation:'photos.replace',
    entity_id:vehicleId,actor_id:actor.userId,status:'OLD_FILE_CLEANUP_REQUIRED',
    detail_json:JSON.stringify({storageRef:oldStorage}),created_at:now()}));
  }
  return {vehicleId,slot,replaced:true};
 }
 function registrationPhoto(p,actor){
  const requestId=need(p.requestId,'REQUEST_ID'),photoId=need(p.photoId,'PHOTO_ID');
  const request=store.one('vc_registration_requests',{request_id:requestId});
  if(!request)throw new Error('NOT_FOUND');
  const photo=(JSON.parse(request.application_json).photos||[]).find(f=>f.photoId===photoId);
  if(!photo)throw new Error('PHOTO_NOT_FOUND');
  audit(actor,'registration',requestId,'REGISTRATION_PHOTO_VIEWED');
  const media=drivePhotos.read(photo.storageRef);
  return {photoId,slot:photo.slot,mimeType:media.mime_type,base64Image:media.base64Image};
 }
 // R7 (owner: "ทำไมไม่มีภาพรถ"): approved-vehicle evidence photo bytes for roles holding
 // vehicle.photos.read (the permission that already lists them). Only an ACTIVE photo of an ACTIVE
 // vehicle; every view is logged in vc_lookup_audit (source PHOTO), not in the change history.
 // vehicles.photo: the shared flow (VC-ADR-046 phase 2b), the photo read through the media port
 function vehiclePhoto(p,actor){return runFlowSync(vehiclePhotoFlow(p,actor,{now,id,sha256:x=>security.sha256(x)}),{store,media:drivePhotos});}
 function dueJobs(p){
  const cutoff=Date.parse(now()),items=store.list('vc_retention_jobs',{status:'WAITING_RETENTION'}).filter(j=>
   j.status==='WAITING_RETENTION'&&Date.parse(j.due_at)<=cutoff&&j.legal_hold!==true&&String(j.legal_hold)!=='true')
   .map(j=>({jobId:j.job_id,vehicleId:j.vehicle_id,dueAt:j.due_at,status:j.status}));
  return paginate(items,p,{defaultLimit:50,maxLegacyLimit:100});
 }
 function executableJobs(p){
  // RETENTION_WORKER-scoped read: only jobs the worker may actually execute (approved/failed, due, no hold).
  // Lets the worker discover work without retention.read; single bounded snapshot read, no join.
  const cutoff=Date.parse(now()),items=store.list('vc_retention_jobs').filter(j=>
   ['DELETION_APPROVED','DELETION_FAILED'].includes(j.status)&&j.approved_by&&Date.parse(j.due_at)<=cutoff
   &&j.legal_hold!==true&&String(j.legal_hold)!=='true')
   .map(j=>({jobId:j.job_id,vehicleId:j.vehicle_id,dueAt:j.due_at,status:j.status,attempts:Number(j.attempts),lastError:j.last_error}));
  return paginate(items,p,{defaultLimit:50,maxLegacyLimit:100});
 }
 function approveDeletion(p,actor){
  const jobId=need(p.jobId,'JOB_ID');
  return store.withLock(()=>{
   const job=store.one('vc_retention_jobs',{job_id:jobId});
   if(!job||job.status!=='WAITING_RETENTION'||Date.parse(job.due_at)>Date.parse(now())
    ||job.legal_hold===true||String(job.legal_hold)==='true')throw new Error('RETENTION_NOT_APPROVABLE');
   store.update('vc_retention_jobs',{job_id:jobId},{status:'DELETION_APPROVED',approved_by:actor.userId,approved_at:now(),updated_at:now()});
   audit(actor,'retention',jobId,'DELETION_APPROVED');
   return {jobId,approved:true};
  });
 }
 function status(p){
  const job=store.one('vc_retention_jobs',{job_id:need(p.jobId,'JOB_ID')});
  return job?{jobId:job.job_id,vehicleId:job.vehicle_id,status:job.status,attempts:Number(job.attempts),lastError:job.last_error}:null;
 }
 function executeDeletion(p,actor){
  if(!allowDestructiveRetention)throw new Error('RETENTION_EXECUTION_DISABLED');
  const jobId=need(p.jobId,'JOB_ID');
  const job=store.one('vc_retention_jobs',{job_id:jobId});
  if(!job||!['DELETION_APPROVED','DELETION_FAILED'].includes(job.status)||!job.approved_by
   ||Date.parse(job.due_at)>Date.parse(now())||job.legal_hold===true||String(job.legal_hold)==='true')
   throw new Error('DELETION_NOT_AUTHORIZED');
  store.withLock(()=>store.update('vc_retention_jobs',{job_id:jobId},{status:'DELETION_IN_PROGRESS',
   attempts:Number(job.attempts)+1,updated_at:now()}));
  try {
   const vehicleId=job.vehicle_id;
   for(const photo of store.list('vc_vehicle_photos',{vehicle_id:vehicleId}))drivePhotos.trash(photo.storage_ref);
   store.withLock(()=>{
    for(const table of ['vc_vehicle_photos','vc_vehicle_contacts','vc_qr_tokens','vc_change_requests','vc_registration_requests']){
     for(const row of store.list(table,{vehicle_id:vehicleId})){
      const key=Object.keys(row).find(k=>({vc_vehicle_photos:'photo_id',vc_vehicle_contacts:'contact_id',vc_qr_tokens:'qr_id',vc_change_requests:'change_id',vc_registration_requests:'request_id'})[table]===k);
      store.remove(table,{[key]:row[key]});
     }
    }
    if(store.one('vc_vehicles',{vehicle_id:vehicleId}))store.remove('vc_vehicles',{vehicle_id:vehicleId});
    // Change and lookup audits are NOT deleted, per retained-evidence policy.
    store.update('vc_retention_jobs',{job_id:jobId},{status:'DELETION_COMPLETED',last_error:'',updated_at:now()});
    audit(actor,'retention',jobId,'DELETION_COMPLETED');
   });
   return {jobId,status:'DELETION_COMPLETED'};
  }catch(e){
   store.sequence(()=>store.update('vc_retention_jobs',{job_id:jobId},{status:'DELETION_FAILED',last_error:String(e.message||'FAILURE').slice(0,120),updated_at:now()}));
   throw new Error('DELETION_RETRY_REQUIRED');
  }
 }
 // TUNEUP R1: the two audit trails grow with every lookup/change (1,487 docs on 2026-11-25) and were
 // read IN FULL on every page. Now: the newest page*pageSize of each (newest-first, _seq DESC) + a
 // COUNT of each, in ONE parallel round; the merged window is cut to the requested page.
 function queryAudit(p) {
  const w=pageWindow(p,{defaultLimit:50,maxLegacyLimit:100});
  const lf=p.vehicleId?{vehicle_id:need(p.vehicleId,'VEHICLE_ID')}:{},cf=p.vehicleId?{entity_id:need(p.vehicleId,'VEHICLE_ID')}:{};
  let lookupRows,changeRows,total;
  if(typeof store.readMany==='function'&&typeof store.count==='function'){
   const [l,c,ln,cn]=store.readMany([{kind:'newest',name:'vc_lookup_audit',filter:lf,limit:w.n},{kind:'newest',name:'vc_change_audit',filter:cf,limit:w.n},
    {kind:'count',name:'vc_lookup_audit',filter:lf},{kind:'count',name:'vc_change_audit',filter:cf}]);
   lookupRows=l;changeRows=c;total=ln+cn;
  }else{lookupRows=store.list('vc_lookup_audit',lf);changeRows=store.list('vc_change_audit',cf);total=lookupRows.length+changeRows.length;}
  const lookup=lookupRows.map(x=>({type:'LOOKUP',eventId:x.audit_id,actorId:x.actor_id,vehicleId:x.vehicle_id,action:x.lookup_source,at:x.created_at}));
  const changes=changeRows.map(x=>({type:'CHANGE',eventId:x.audit_id,actorId:x.actor_id,entityId:x.entity_id,action:x.action,at:x.created_at}));
  const items=[...lookup,...changes].sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  return pageOf(items.slice(0,w.n),total,w);
 }
 return Object.freeze({
  'photos.upload':uploadPhoto,'photos.list':photosList,'photos.replace':replacePhoto,
  'registrations.photo':registrationPhoto,'vehicles.photo':vehiclePhoto,
  'retention.listDue':dueJobs,'retention.listExecutable':executableJobs,'retention.approve':approveDeletion,
  'retention.execute':executeDeletion,'retention.jobStatus':status,
  'audit.query':queryAudit,'audit.export':p=>({format:'JSON',rows:queryAudit({...(p.vehicleId?{vehicleId:p.vehicleId}:{}),limit:100})})
 });
}
