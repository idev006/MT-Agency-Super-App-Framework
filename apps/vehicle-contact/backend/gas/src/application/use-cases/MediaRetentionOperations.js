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
  const item=drivePhotos.upload(p.base64Image,p.mimeType),photoId=id();
  try{
   store.atomic(()=>{
    store.insert('vc_photo_staging',{photo_id:photoId,campaign_id:campaign.campaign_id,slot:p.slot,
     storage_ref:item.storage_ref,mime_type:item.mime_type,size_bytes:item.size_bytes,
     status:'STAGED',created_at:now(),used_at:''});
   });
  }catch(e){try{drivePhotos.trash(item.storage_ref);}catch(_){/* orphan requires reconciliation */}throw e;}
  return {photoId,slot:p.slot};
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
   store.atomic(()=>{
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
   store.atomic(()=>store.insert('vc_operation_journal',{event_id:id(),operation:'photos.replace',
    entity_id:vehicleId,actor_id:actor.userId,status:'OLD_FILE_CLEANUP_REQUIRED',
    detail_json:JSON.stringify({storageRef:oldStorage}),created_at:now()}));
  }
  return {vehicleId,slot,replaced:true};
 }
 function dueJobs(p){
  const cutoff=Date.parse(now()),limit=p.limit===undefined?50:p.limit;
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error('INVALID_LIMIT');
  return store.list('vc_retention_jobs').filter(j=>
   j.status==='WAITING_RETENTION'&&Date.parse(j.due_at)<=cutoff&&j.legal_hold!==true&&String(j.legal_hold)!=='true')
   .slice(0,limit).map(j=>({jobId:j.job_id,vehicleId:j.vehicle_id,dueAt:j.due_at,status:j.status}));
 }
 function approveDeletion(p,actor){
  const jobId=need(p.jobId,'JOB_ID');
  return store.atomic(()=>{
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
  store.atomic(()=>store.update('vc_retention_jobs',{job_id:jobId},{status:'DELETION_IN_PROGRESS',
   attempts:Number(job.attempts)+1,updated_at:now()}));
  try {
   const vehicleId=job.vehicle_id;
   for(const photo of store.list('vc_vehicle_photos',{vehicle_id:vehicleId}))drivePhotos.trash(photo.storage_ref);
   store.atomic(()=>{
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
   store.atomic(()=>store.update('vc_retention_jobs',{job_id:jobId},{status:'DELETION_FAILED',last_error:String(e.message||'FAILURE').slice(0,120),updated_at:now()}));
   throw new Error('DELETION_RETRY_REQUIRED');
  }
 }
 function queryAudit(p) {
  const limit=p.limit===undefined?50:p.limit;
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error('INVALID_LIMIT');
  const lookup=store.list('vc_lookup_audit',p.vehicleId?{vehicle_id:need(p.vehicleId,'VEHICLE_ID')}:{})
   .map(x=>({type:'LOOKUP',eventId:x.audit_id,actorId:x.actor_id,vehicleId:x.vehicle_id,action:x.lookup_source,at:x.created_at}));
  const changes=store.list('vc_change_audit',p.vehicleId?{entity_id:need(p.vehicleId,'VEHICLE_ID')}:{})
   .map(x=>({type:'CHANGE',eventId:x.audit_id,actorId:x.actor_id,entityId:x.entity_id,action:x.action,at:x.created_at}));
  return [...lookup,...changes].sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,limit);
 }
 return Object.freeze({
  'photos.upload':uploadPhoto,'photos.list':photosList,'photos.replace':replacePhoto,
  'retention.listDue':dueJobs,'retention.approve':approveDeletion,
  'retention.execute':executeDeletion,'retention.jobStatus':status,
  'audit.query':queryAudit,'audit.export':p=>({format:'JSON',rows:queryAudit({...p,limit:100})})
 });
}
