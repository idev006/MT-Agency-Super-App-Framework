// Pure domain schema contract; never import Google Apps Script services here.
export const VEHICLE_SCHEMA_V1 = Object.freeze({
  vc_vehicles:["vehicle_id","plate_normalized","province_code","vehicle_type","make","model","color","status","version","created_at","updated_at","created_by","updated_by"],
  vc_vehicle_contacts:["contact_id","vehicle_id","display_name","phone_e164","relationship","is_primary","status","verified_at","created_at","updated_at"],
  vc_qr_tokens:["qr_id","vehicle_id","token_digest","issued_at","revoked_at","issued_by","reason","status"],
  vc_vehicle_photos:["photo_id","vehicle_id","slot","storage_ref","mime_type","size_bytes","status","version","created_at"],
  vc_lookup_audit:["audit_id","actor_id","vehicle_id","lookup_source","result","correlation_id","created_at"],
  vc_change_audit:["audit_id","actor_id","entity_type","entity_id","action","redacted_summary","correlation_id","created_at"]
});
