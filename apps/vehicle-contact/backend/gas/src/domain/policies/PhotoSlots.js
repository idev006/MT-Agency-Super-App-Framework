// Five stable UI/media slots; this does NOT decide minimum photos needed to ACTIVATE a vehicle.
export const VEHICLE_PHOTO_SLOTS=Object.freeze(['FRONT','REAR','LEFT','RIGHT','THREE_QUARTER']);
export function validatePhotoSlotSelection(photos) {
  if(!Array.isArray(photos)) return {valid:false,errors:['PHOTOS_NOT_ARRAY']};
  const seen=new Set(),errors=[];
  if(photos.length>VEHICLE_PHOTO_SLOTS.length) errors.push('TOO_MANY_PHOTOS');
  for(const photo of photos){
    const slot=photo && photo.slot;
    if(!VEHICLE_PHOTO_SLOTS.includes(slot)){errors.push('INVALID_SLOT');continue;}
    if(seen.has(slot))errors.push('DUPLICATE_SLOT');
    seen.add(slot);
  }
  return {valid:errors.length===0,errors};
}
