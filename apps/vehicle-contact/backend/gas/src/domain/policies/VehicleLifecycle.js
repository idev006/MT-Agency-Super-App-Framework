// Pure business policies; no GAS globals or persistence. Do not expose as public API without auth.
const VEHICLE = Object.freeze({
 PENDING_APPROVAL:'PENDING_APPROVAL', ACTIVE:'ACTIVE', REJECTED:'REJECTED',
 SUSPENDED:'SUSPENDED', INACTIVE:'INACTIVE'
});
const ALLOWED = Object.freeze({
 PENDING_APPROVAL:['ACTIVE','REJECTED'],
 ACTIVE:['SUSPENDED','INACTIVE'],
 SUSPENDED:['ACTIVE','INACTIVE'],
 REJECTED:[], INACTIVE:[]
});
const PHOTO_SLOTS = Object.freeze(['FRONT','REAR','LEFT','RIGHT','FRONT_ANGLE']);
export function normalizePlate(value) {
 if(typeof value!=='string') throw new TypeError('plate must be a string');
 const plate=value.normalize('NFKC').replace(/[\s\u200b\u200c\u200d\-]/g,'').toUpperCase();
 if(!plate || plate.length>24) throw new RangeError('invalid plate');
 return plate;
}
export function vehicleBusinessKey(plate,province) {
 if(typeof province!=='string' || !/^[A-Za-z0-9_-]{1,32}$/.test(province))
  throw new TypeError('invalid province code');
 return normalizePlate(plate)+'|'+province.toUpperCase();
}
export function validateFivePhotos(photos) {
 if(!Array.isArray(photos)||photos.length!==5) return false;
 const slots=photos.map(p=>p&&p.slot);
 return new Set(slots).size===5 && PHOTO_SLOTS.every(s=>slots.includes(s));
}
export function assertVehicleTransition(from,to) {
 if(!Object.prototype.hasOwnProperty.call(ALLOWED,from)||!ALLOWED[from].includes(to))
  throw new Error('INVALID_VEHICLE_TRANSITION');
 return true;
}
export function assertApproval(actorPermissions,record) {
 if(!Array.isArray(actorPermissions)||!actorPermissions.includes('vehicle.registration.approve'))
  throw new Error('FORBIDDEN');
 if(!record||record.status!==VEHICLE.PENDING_APPROVAL)
  throw new Error('INVALID_VEHICLE_TRANSITION');
 return true;
}
export function canDeleteVehicle(job,actorPermissions,nowIso) {
 if(!Array.isArray(actorPermissions)||!actorPermissions.includes('retention.delete.approve'))
  return {allowed:false,reason:'FORBIDDEN'};
 if(!job||job.status!=='DELETION_APPROVED'||!job.approved_by)
  return {allowed:false,reason:'APPROVAL_REQUIRED'};
 if(job.legal_hold===true) return {allowed:false,reason:'LEGAL_HOLD'};
 const due=Date.parse(job.due_at),now=Date.parse(nowIso);
 if(!Number.isFinite(due)||!Number.isFinite(now)||now<due)
  return {allowed:false,reason:'NOT_DUE'};
 return {allowed:true};
}
export function assertSingleActiveQr(tokens,vehicleId) {
 const count=(tokens||[]).filter(t=>t.vehicle_id===vehicleId&&t.status==='ACTIVE').length;
 if(count>1) throw new Error('MULTIPLE_ACTIVE_QR');
 return true;
}
export { VEHICLE, PHOTO_SLOTS };
