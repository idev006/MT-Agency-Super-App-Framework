// Put an approved vehicle's photos into its own Drive folder, named by side (VC-ADR-050) — ONE source for both engines.
// Used after a registration is approved and after a photo is replaced; PR C's job runs it for the existing vehicles.
// Best effort by design: the Drive file ids do not change when a file moves, so a failure leaves every photo readable where
// it is; the caller never undoes its own work because of it. → {organized, folderId} | {organized: false, reason}
// Effects: reads, mediaOrganize, patch.
import {organizeRequest} from '../../domain/policies/PhotoLayout.js';

export function* organizeVehiclePhotosFlow(vehicleId) {
  const [vehicle, photos] = yield {reads: [{kind: 'one', name: 'vc_vehicles', filter: {vehicle_id: vehicleId}},
    {kind: 'list', name: 'vc_vehicle_photos', filter: {vehicle_id: vehicleId}}]};
  const active = (photos || []).filter(p => p.status === 'ACTIVE' && p.storage_ref);
  if (!vehicle || !active.length) return {organized: false, reason: 'NOTHING_TO_ORGANIZE'};
  try {
    const {folderId} = yield {mediaOrganize: organizeRequest(vehicle, active, vehicle.photo_folder_id)};
    if (folderId && folderId !== vehicle.photo_folder_id)
      yield {patch: {table: 'vc_vehicles', filter: {vehicle_id: vehicleId}, fields: {photo_folder_id: folderId}}};
    return {organized: true, folderId};
  } catch (e) {
    return {organized: false, reason: String(e?.message || 'ORGANIZE_FAILED').slice(0, 64)};
  }
}
