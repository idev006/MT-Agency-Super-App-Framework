import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createVehicleOperations} from '../src/application/use-cases/VehicleOperations.js';

// Legacy rows approved before the text-preserving write fix have province_code
// coerced to a NUMBER by Sheets USER_ENTERED. vehicles.lookup must still find
// them (string-tolerant comparison), consistent with SheetsVehicleReadRepository.
const security={sha256:value=>createHash('sha256').update(value).digest('hex'),now:()=>new Date(0).toISOString(),secretToken:()=>'token'};
function ops(vehicleRows){
 const store={
  list(table){if(table==='vc_vehicles')return vehicleRows.map(v=>({...v}));return[];},
  sequence(fn){return fn();},
  insert(){return{};}
 };
 return createVehicleOperations({store,security,campaigns:{},references:{}});
}
const actor={userId:'a1',permissions:['vehicle.lookup','vehicle.contact.read','vehicle.photos.read']};

test('vehicles.lookup tolerates legacy numeric province_code coercion',()=>{
 const op=ops([{vehicle_id:'v1',plate_normalized:'ฑฆ9901',province_code:10,status:'ACTIVE',version:1,make:'TOYOTA',model:'X',color:'WHITE',vehicle_type:'RY01'}]);
 const found=op['vehicles.lookup']({plate:'ฑฆ 9901',province:'10'},actor);
 assert.ok(found,'lookup must find the vehicle despite numeric province_code');
 assert.equal(found.vehicleId,'v1');
});

test('vehicles.lookup still matches clean text province_code and rejects wrong province',()=>{
 const op=ops([{vehicle_id:'v2',plate_normalized:'ฑฆ9902',province_code:'50',status:'ACTIVE',version:1}]);
 assert.equal(op['vehicles.lookup']({plate:'ฑฆ9902',province:'50'},actor).vehicleId,'v2');
 assert.equal(op['vehicles.lookup']({plate:'ฑฆ9902',province:'10'},actor),null);
});