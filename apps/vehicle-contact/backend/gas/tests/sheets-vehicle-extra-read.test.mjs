import assert from "node:assert/strict";
import {createSheetsVehicleRepository} from "../src/infrastructure/persistence/sheets/SheetsVehicleRepository.js";
const rows={
vc_vehicles:[["vehicle_id","plate_normalized","province_code","status"],["v1","กข1234","TH-10","ACTIVE"]],
vc_vehicle_contacts:[["contact_id","vehicle_id","status","is_primary","phone_e164"],["c1","v1","ACTIVE",true,"+66000000000"],["c2","v1","INACTIVE",false,"+66111111111"]],
vc_vehicle_photos:[["photo_id","vehicle_id","slot","status"],["p1","v1","FRONT","ACTIVE"],["p2","v1","REAR","REVOKED"]],
vc_lookup_audit:[["audit_id","actor_id","vehicle_id","created_at"],["a1","u1","v1","2026-01-01"],["a2","u2","v1","2026-01-02"]],
vc_change_audit:[["entity_type","entity_id","action","created_at"]]
};
const sheets={openById(){return {getSheetByName(t){return rows[t]?{getDataRange(){return {getValues(){return rows[t]}}}}:null}}}};
const db=createSheetsVehicleRepository(sheets,"test");
assert.equal(db.getVehicleContact("v1").length,1);
assert.equal(db.getVehicleContact("missing"),null);
assert.equal(db.listPhotos("v1").length,1);
assert.equal(db.listPhotos("missing").length,0);
assert.equal(db.queryAudit({limit:1})[0].audit_id,"a2");
assert.equal(db.queryAudit({vehicleId:"missing"}).length,0);
assert.equal(db.exportAudit().format,"JSON");
assert.throws(()=>db.queryAudit({limit:101}),/INVALID_LIMIT/);
console.log("Read-only Sheets adapter additional tests passed");
