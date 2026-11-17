import assert from 'node:assert/strict';
import {createSheetsVehicleReadRepository} from '../src/infrastructure/persistence/sheets/SheetsVehicleReadRepository.js';
const tables={
 vc_vehicles:[['vehicle_id','plate_normalized','province_code','status'],['v1','กข1234','TH-10','ACTIVE']],
 vc_vehicle_contacts:[['vehicle_id','display_name','phone_e164','is_primary','status'],['v1','Test','+66123456789',true,'ACTIVE']],
 vc_vehicle_photos:[['vehicle_id','slot','storage_ref','status'],['v1','FRONT','drive-file-1','ACTIVE']]
};
const spreadsheet={openById(id){assert.equal(id,'staging-sheet');return {getSheetByName(name){return tables[name]?{getDataRange(){return {getValues(){return tables[name];}}}}:null;}};}};
const audits=[];
const repo=createSheetsVehicleReadRepository(spreadsheet,'staging-sheet',{audit:e=>audits.push(e)});
const principal={userId:'staff',permissions:['vehicle.lookup']};
const context={trustedBoundary:true,principal};
const result=repo.lookupByBusinessKey('กข1234|TH-10',context);
assert.equal(result.vehicle.vehicle_id,'v1');
assert.equal(result.contact.phone_e164,undefined);
assert.equal(result.photos.length,0);
assert.equal(audits.length,1);
const privileged={...context,principal:{userId:'staff',permissions:['vehicle.lookup','vehicle.contact.read','vehicle.photos.read']}};
assert.equal(repo.getVehicle('v1',privileged).contact.phone_e164,'+66123456789');
assert.equal(repo.getVehicle('v1',privileged).photos.length,1);
assert.throws(()=>repo.getVehicle('v1',{trustedBoundary:true,principal:{userId:'anon',permissions:[]}}),/FORBIDDEN/);
assert.equal(repo.lookupByBusinessKey('กข9999|TH-10',context),null);
assert.equal(audits.at(-1).result,'NOT_FOUND');
console.log('Read-only Sheets adapter tests PASSED');
