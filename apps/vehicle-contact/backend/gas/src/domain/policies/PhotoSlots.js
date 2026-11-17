// Five mandatory vehicle photo slots per approved business baseline R01–R26.
export const VEHICLE_PHOTO_SLOTS=Object.freeze(['FRONT','REAR','LEFT','RIGHT','FRONT_ANGLE']);
export function validatePhotoSlotSelection(photos) {
  if(!Array.isArray(photos)) return {valid:false,errors:['PHOTOS_NOT_ARRAY']};
  const seen=new Set(),errors=[];
  if(photos.length>VEHICLE_PHOTO_SLOTS.length) errors.push('TOO_MANY_PHOTOS');
  if(photos.length<VEHICLE_PHOTO_SLOTS.length) errors.push('FIVE_PHOTOS_REQUIRED');
  for(const photo of photos){
    const slot=photo && photo.slot;
    if(!VEHICLE_PHOTO_SLOTS.includes(slot)){errors.push('INVALID_SLOT');continue;}
    if(seen.has(slot))errors.push('DUPLICATE_SLOT');
    seen.add(slot);
  }
  return {valid:errors.length===0,errors};
}
