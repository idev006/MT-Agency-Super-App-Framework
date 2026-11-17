// Draft-only pure validation; no Sheets writes or new protected routes.
// Business approval of mandatory photo count and contact fields is still OPEN.
export function validateVehicleRegistrationDraft(input) {
  const errors=[];
  if(!input || typeof input!=='object' || Array.isArray(input))
    return {valid:false,errors:['INVALID_RECORD']};
  for(const name of ['plate_normalized','province_code']) {
    if(typeof input[name]!=='string' || !input[name].trim()) errors.push('REQUIRED_'+name.toUpperCase());
  }
  if(typeof input.vehicle_id!=='string' || !input.vehicle_id.trim()) errors.push('REQUIRED_VEHICLE_ID');
  if(input.version!==undefined && (!Number.isInteger(input.version) || input.version<0))
    errors.push('INVALID_VERSION');
  return {valid:errors.length===0,errors};
}
