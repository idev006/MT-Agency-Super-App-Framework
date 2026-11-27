// Where an approved vehicle's photos live in the owner's Drive (VC-ADR-050, owner 2026-11-27: "สร้างโฟลเดอร์ของรถคันนั้นๆ ...
// ชื่อรูปต้องสื่อความหมายว่าเป็นด้านใดของรถ" → "อนุมัติ"). ONE source for the names; the caller computes them and the GAS bridge
// only creates / moves / renames / shares (it stays a plain bridge):
//   <photos folder>/รถ/<province>/<province> <plate> · <vehicle_id first 8>/FRONT.jpg | REAR.jpg | LEFT.jpg | RIGHT.jpg | FRONT_ANGLE.jpg
// The plate + province help a person find the car; the id part keeps two registrations of one plate apart. The system never
// looks a folder up by name: it keeps the folder id on the vehicle and each file's Drive id on the photo row.
import {PHOTO_SLOTS} from './VehicleLifecycle.js';

export const VEHICLES_FOLDER = 'รถ';
const EXT = Object.freeze({'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'});
const SAFE = /[\\/:*?"<>|\u0000-\u001f]/g; // characters Drive or a downloaded copy would not keep in a name
const clean = (text, max) => String(text || '').replace(SAFE, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// [top folder, province folder, vehicle folder] for a vehicle row (plate_normalized, province_code, vehicle_id)
export function vehicleFolderPath(vehicle) {
  const province = clean(vehicle.province_code, 32), plate = clean(vehicle.plate_normalized, 40), id = clean(vehicle.vehicle_id, 64).slice(0, 8);
  if (!province || !plate || id.length < 8) throw new Error('INVALID_PHOTO_LAYOUT');
  return [VEHICLES_FOLDER, province, `${province} ${plate} · ${id}`];
}
// the file name of a photo: its side + the extension of its type (FRONT.jpg)
export function photoFileName(slot, mime) {
  if (!PHOTO_SLOTS.includes(slot) || !EXT[mime]) throw new Error('INVALID_PHOTO_LAYOUT');
  return `${slot}.${EXT[mime]}`;
}
// a bridge `organize` request for a vehicle's ACTIVE photos ({storage_ref, slot, mime_type} rows)
export function organizeRequest(vehicle, photos, folderId = '') {
  return {folderId: folderId || '', path: vehicleFolderPath(vehicle),
    files: photos.map(p => ({ref: String(p.storage_ref), name: photoFileName(p.slot, p.mime_type)}))};
}
