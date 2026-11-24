// changes.review as its own module (keeps the compiled VehicleOperations.gs under the 800-line bound).
 // C6 (2026-11-24): was 3 unguarded writes (double apply under a race, partial on failure). Now ONE
 // version-guarded commit; on conflict re-read: same decision applied → replay, other → INVALID_REQUEST_STATE.
export function createChangeReview({store,need,now,id,readAll,writeAll}){
 return function changeReview(p,a){
  const requestId=need(p.requestId,'REQUEST_ID');
  if(!['APPROVE','REJECT'].includes(p.decision))throw new Error('INVALID_DECISION');
  const target=p.decision==='APPROVE'?'APPROVED':'REJECTED';
  return store.withLock(()=>{
   for(let attempt=1;;attempt++){
    try{return reviewChangeOnce();}
    catch(error){
     if(!error||error.message!=='WRITE_CONFLICT')throw error;
     if(attempt>=4)throw new Error('BUSY');
    }
   }
  });
  function reviewChangeOnce(){
   const [request]=readAll([{kind:'versioned',name:'vc_change_requests',filter:{change_id:requestId}}]);
   const r=request&&request.row;
   if(!r)throw new Error('INVALID_REQUEST_STATE');
   if(r.status===target)return {requestId,status:p.decision,replayed:true};
   if(r.status!=='PENDING')throw new Error('INVALID_REQUEST_STATE');
   const at=now(),writes=[];
   if(p.decision==='APPROVE'){
    const delta=JSON.parse(r.proposed_delta),wantsContact=delta.contactName!==undefined||delta.contactPhone!==undefined;
    const [vehicle,contacts]=readAll([{kind:'versioned',name:'vc_vehicles',filter:{vehicle_id:r.vehicle_id}},
     ...(wantsContact?[{kind:'list',name:'vc_vehicle_contacts',filter:{vehicle_id:r.vehicle_id}}]:[])]);
    const v=vehicle&&vehicle.row;
    if(!v||v.status!=='ACTIVE')throw new Error('VEHICLE_NOT_ACTIVE');
    const patch={updated_at:at,updated_by:a.userId,version:Number(v.version)+1};
    for(const [client,field] of [['brand','make'],['model','model'],['color','color']])if(delta[client]!==undefined)patch[field]=delta[client];
    writes.push({op:'update',table:'vc_vehicles',key:{vehicle_id:v.vehicle_id},fields:patch,...(vehicle.version?{ifVersion:vehicle.version}:{})});
    if(wantsContact){
     const c=(contacts||[]).find(x=>x.status==='ACTIVE'&&x.is_primary===true);
     if(!c)throw new Error('CONTACT_NOT_FOUND');
     const changes={updated_at:at};
     if(delta.contactName!==undefined)changes.display_name=delta.contactName;
     if(delta.contactPhone!==undefined)changes.phone_e164=delta.contactPhone;
     writes.push({op:'update',table:'vc_vehicle_contacts',key:{contact_id:c.contact_id},fields:changes});
    }
   }
   writes.push({op:'update',table:'vc_change_requests',key:{change_id:requestId},fields:{status:target,reviewed_by:a.userId,reviewed_at:at},
    ...(request.version?{ifVersion:request.version}:{})});
   writes.push({op:'insert',table:'vc_change_audit',data:{audit_id:id(),actor_id:a.userId,entity_type:'change',entity_id:requestId,
    action:'CHANGE_'+p.decision,redacted_summary:'CHANGE_'+p.decision,correlation_id:id().slice(0,16),created_at:at}});
   writeAll(writes);
   return {requestId,status:p.decision};
  }
 }
}
