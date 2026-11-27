// Scheduled jobs of the Node core (VC-ADR-046 phase 2c): each job is a shared flow run on the core's store and ports, so
// GAS keeps only the photo bridge. A job never prints data — its report is counters and short id prefixes.
import {runFlowAsync} from '../../../gas/src/application/flows/FlowRunner.js';
import {drivePhotoHousekeepingFlow} from '../../../gas/src/application/flows/DrivePhotoHousekeepingFlow.js';
import {drivePhotoAuditFlow} from '../../../gas/src/application/flows/DrivePhotoAuditFlow.js';

// name -> ({store, media, apply, nowMs}) -> report
export const JOBS = Object.freeze({
  // daily: abandoned uploads + unreferenced files of the photo folder to the Drive trash (30-day undo)
  'drive-photo-housekeeping': ({store, media, apply = false, nowMs = Date.now()}) =>
    runFlowAsync(drivePhotoHousekeepingFlow({apply, nowMs}), {store, media}),
  // on demand, read-only: Firestore photo rows <-> files in the Drive photo folder (L4 SSOT file proof)
  'drive-photo-audit': ({store, media}) => runFlowAsync(drivePhotoAuditFlow(), {store, media})
});
