// Vehicle read model (lookup / detail / QR): own module to keep VehicleOperations.gs < 800 lines.
export function createVehicleView({store,now,id}){
 return function vehicleView(v,actor,source) {
  if(!v||v.status!=='ACTIVE')return null;
  // Speed: the access-audit row is written in the SAME parallel round as the view reads (was its
  // own round before them). Still recorded on every view, still append-only and atomic.
  const auditRow={audit_id:id(),actor_id:actor.userId,vehicle_id:v.vehicle_id,lookup_source:source,result:'FOUND',
   correlation_id:id().slice(0,16),created_at:now()};
  const response={vehicleId:v.vehicle_id,plate:v.plate_normalized,province:v.province_code,status:v.status,
   vehicleType:v.vehicle_type,plateType:v.plate_type,brand:v.make,model:v.model,color:v.color,stickerCategory:v.sticker_category||'',version:Number(v.version)};
  // Contacts and photos are independent reads: fetched in ONE parallel round when the store
  // supports readMany (Firestore), sequentially otherwise. Permission gating is unchanged.
  const wantContacts=actor.permissions.includes('vehicle.contact.read');
  const wantPhotos=actor.permissions.includes('vehicle.photos.read');
  const reads=[];
  if(wantContacts)reads.push({kind:'list',name:'vc_vehicle_contacts',filter:{vehicle_id:v.vehicle_id}});
  if(wantPhotos)reads.push({kind:'list',name:'vc_vehicle_photos',filter:{vehicle_id:v.vehicle_id}});
  // E2E 2026-11-24: search roles saw codes (RY01/WHITE/OWNER) and an empty history. Labels are read
  // by reference id and history by entity id (live index exists) in the same parallel round.
  const wantHistory=actor.permissions.includes('vehicle.history.read');
  if(wantHistory)reads.push({kind:'list',name:'vc_change_audit',filter:{entity_id:v.vehicle_id}});
  const refKeys=[['VEHICLE_TYPE',v.vehicle_type],['COLOR',v.color],['PLATE_TYPE',v.plate_type]]
   .filter(([,code])=>code);
  for(const [catalog,code] of refKeys)reads.push({kind:'one',name:'vc_reference_values',filter:{reference_id:'REF-'+catalog+'-'+code}});
  // R7 (owner: "ข้อมูลอื่นๆ เพื่อประกอบการพิจารณาครบมั้ย"): agency + active QR, equality-only reads.
  const extra=reads.length;
  if(v.organization_id)reads.push({kind:'one',name:'vc_organizations',filter:{organization_id:v.organization_id}});
  reads.push({kind:'one',name:'vc_qr_tokens',filter:{vehicle_id:v.vehicle_id,status:'ACTIVE'}});
  let rows;
  if(typeof store.readMany==='function')rows=store.readMany(reads,{inserts:[['vc_lookup_audit',auditRow]]});
  else{
   store.insert('vc_lookup_audit',auditRow);
   rows=reads.map(r=>r.kind==='one'?(typeof store.one==='function'?store.one(r.name,r.filter):(store.list(r.name,r.filter)||[])[0]||null):store.list(r.name,r.filter));
  }
  const tail=rows.splice(extra); // [organization?, activeQr]
  const qrRow=tail.pop(),orgRow=v.organization_id?tail.pop():null;
  const contactRows=wantContacts?rows.shift():[],photoRows=wantPhotos?rows.shift():[],historyRows=wantHistory?rows.shift():[];
  const label={};for(const ref of rows)if(ref&&ref.label_th)label[ref.catalog+'|'+ref.code]=ref.label_th;
  response.organization={id:v.organization_id||'',name:orgRow&&orgRow.name||''};
  response.registeredAt=v.created_at||'';response.updatedAt=v.updated_at||'';
  response.qr={active:Boolean(qrRow),issuedAt:qrRow&&qrRow.issued_at||''};
  const labelOf=(catalog,code)=>label[catalog+'|'+code]||'';
  response.labels={vehicleType:labelOf('VEHICLE_TYPE',v.vehicle_type),color:labelOf('COLOR',v.color),plateType:labelOf('PLATE_TYPE',v.plate_type)};
  if(wantContacts)
   response.contacts=contactRows.filter(c=>c.status==='ACTIVE')
    .map(c=>({name:c.display_name,phone:c.phone_e164,relationship:c.relationship,isPrimary:c.is_primary,verifiedAt:c.verified_at||''}));
  if(wantPhotos)
   response.photos=photoRows.filter(x=>x.status==='ACTIVE')
    .map(x=>({photoId:x.photo_id,slot:x.slot,storageRef:x.storage_ref,mimeType:x.mime_type,createdAt:x.created_at||''}));
  if(wantHistory)response.history=historyRows.slice(-100)
   .map(x=>({audit_id:x.audit_id,action:x.action,redacted_summary:x.redacted_summary,created_at:x.created_at}));
  return response;
 };
}
