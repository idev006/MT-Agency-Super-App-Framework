import {paginate} from '../pagination/Pagination.js';
export function createMediaRetentionOperations({store,security,drivePhotos,campaigns,allowDestructiveRetention=false}) {
 const need=(v,name)=>{if(typeof v!=='string'||!v.trim()||v.length>256)throw new Error('INVALID_'+name);return v.trim();};
 const now=()=>security.now(),id=()=>security.secretToken();
 const audit=(actor,kind,entity,action)=>store.insert('vc_change_audit',{
  audit_id:id(),actor_id:actor&&actor.userId||'PUBLIC_CAMPAIGN',entity_type:kind,entity_id:entity,action,
  redacted_summary:action,correlation_id:id().slice(0,16),created_at:now()
 });
 function uploadPhoto(p) {
  const campaign=campaigns.getCampaign(p.campaignToken);
  if(!['FRONT','REAR','LEFT','RIGHT','FRONT_ANGLE'].includes(p.slot))throw new Error('INVALID_SLOT');
  const photoId=id();
  // Upload may be slow: never hold the script lock while transferring bytes to Drive.
  const item=drivePhotos.upload(p.base64Image,p.mimeType);
  try{
   return store.withLock(()=>{
    const current=campaigns.getCampaign(p.campaignToken);
    const maxUploads=Math.min(5000,Math.max(20,Number(current.max_submissions)*10));
    if(store.list('vc_photo_staging',{campaign_id:current.campaign_id}).length>=maxUploads)
     throw new Error('PHOTO_UPLOAD_LIMIT');
    store.insert('vc_photo_staging',{photo_id:photoId,campaign_id:current.campaign_id,slot:p.slot,
     storage_ref:item.storage_ref,mime_type:item.mime_type,size_bytes:item.size_bytes,
     status:'STAGED',created_at:now(),used_at:''});
    return {photoId,slot:p.slot};
   });
  }catch(e){
   try{drivePhotos.trash(item.storage_ref);}catch(_){/* orphan needs operational reconciliation */}
   throw e;
  }
 }
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
 function vehiclePhoto(p,actor){
  const vehicleId=need(p.vehicleId,'VEHICLE_ID'),photoId=need(p.photoId,'PHOTO_ID');
  // Speed: vehicle + photo rows in one parallel round (were two sequential reads).
  const [vehicle,photo]=typeof store.readMany==='function'
   ?store.readMany([{kind:'one',name:'vc_vehicles',filter:{vehicle_id:vehicleId}},{kind:'one',name:'vc_vehicle_photos',filter:{photo_id:photoId}}])
   :[store.one('vc_vehicles',{vehicle_id:vehicleId}),store.one('vc_vehicle_photos',{photo_id:photoId})];
  if(!vehicle||vehicle.status!=='ACTIVE')throw new Error('VEHICLE_NOT_ACTIVE');
  if(!photo||photo.vehicle_id!==vehicleId||photo.status!=='ACTIVE')throw new Error('PHOTO_NOT_FOUND');
  const media=drivePhotos.read(photo.storage_ref);
  store.insert('vc_lookup_audit',{audit_id:id(),actor_id:actor.userId,vehicle_id:vehicleId,lookup_source:'PHOTO',result:'FOUND',
   correlation_id:id().slice(0,16),created_at:now()});
  return {photoId,slot:photo.slot,mimeType:media.mime_type,base64Image:media.base64Image};
 }
 function dueJobs(p){
  const cutoff=Date.parse(now()),items=store.list('vc_retention_jobs').filter(j=>
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
 function queryAudit(p) {
  const lookup=store.list('vc_lookup_audit',p.vehicleId?{vehicle_id:need(p.vehicleId,'VEHICLE_ID')}:{})
   .map(x=>({type:'LOOKUP',eventId:x.audit_id,actorId:x.actor_id,vehicleId:x.vehicle_id,action:x.lookup_source,at:x.created_at}));
  const changes=store.list('vc_change_audit',p.vehicleId?{entity_id:need(p.vehicleId,'VEHICLE_ID')}:{})
   .map(x=>({type:'CHANGE',eventId:x.audit_id,actorId:x.actor_id,entityId:x.entity_id,action:x.action,at:x.created_at}));
  const items=[...lookup,...changes].sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  return paginate(items,p,{defaultLimit:50,maxLegacyLimit:100});
 }
 return Object.freeze({
  'photos.upload':uploadPhoto,'photos.list':photosList,'photos.replace':replacePhoto,
  'registrations.photo':registrationPhoto,'vehicles.photo':vehiclePhoto,
  'retention.listDue':dueJobs,'retention.listExecutable':executableJobs,'retention.approve':approveDeletion,
  'retention.execute':executeDeletion,'retention.jobStatus':status,
  'audit.query':queryAudit,'audit.export':p=>({format:'JSON',rows:queryAudit({...(p.vehicleId?{vehicleId:p.vehicleId}:{}),limit:100})})
 });
}
