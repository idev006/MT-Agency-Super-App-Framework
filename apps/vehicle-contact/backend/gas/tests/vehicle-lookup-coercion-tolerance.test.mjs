import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createVehicleOperations} from '../src/application/use-cases/VehicleOperations.js';

// TUNEUP R1 (2026-11-25): vehicles.lookup is an EQUALITY QUERY on the business key
// (plate_normalized + province_code + status) instead of a full read of vc_vehicles.
// The old Sheets numeric-coercion tolerance is retired with Sheets (VC-ADR-026); the live
// Firestore data was checked: 66/66 plate/province values are strings.
const security={sha256:value=>createHash('sha256').update(value).digest('hex'),now:()=>new Date(0).toISOString(),secretToken:()=>'token'};
function ops(vehicleRows,calls=[]){
 const match=(row,filter)=>Object.entries(filter||{}).every(([k,v])=>row[k]===v);
 const store={
  list(table,filter){calls.push({table,filter});if(table==='vc_vehicles')return vehicleRows.filter(v=>match(v,filter)).map(v=>({...v}));return[];},
  sequence(fn){return fn();},
  insert(){return{};}
 };
 return createVehicleOperations({store,security,campaigns:{},references:{}});
}
const actor={userId:'a1',permissions:['vehicle.lookup','vehicle.contact.read','vehicle.photos.read']};

test('vehicles.lookup pushes the business key to the store (no full collection read)',()=>{
 const calls=[];
 const op=ops([{vehicle_id:'v1',plate_normalized:'ฑฆ9901',province_code:'10',status:'ACTIVE',version:1,make:'TOYOTA',model:'X',color:'WHITE',vehicle_type:'RY01'}],calls);
 const found=op['vehicles.lookup']({plate:'ฑฆ 9901',province:'10'},actor);
 assert.equal(found.vehicleId,'v1');
 const read=calls.find(c=>c.table==='vc_vehicles');
 assert.deepEqual(read.filter,{plate_normalized:'ฑฆ9901',province_code:'10',status:'ACTIVE'});
});

test('vehicles.lookup matches the province exactly and ignores inactive rows',()=>{
 const op=ops([{vehicle_id:'v2',plate_normalized:'ฑฆ9902',province_code:'50',status:'ACTIVE',version:1},
  {vehicle_id:'v3',plate_normalized:'ฑฆ9903',province_code:'50',status:'CANCELLED',version:1}]);
 assert.equal(op['vehicles.lookup']({plate:'ฑฆ9902',province:'50'},actor).vehicleId,'v2');
 assert.equal(op['vehicles.lookup']({plate:'ฑฆ9902',province:'10'},actor),null);
 assert.equal(op['vehicles.lookup']({plate:'ฑฆ9903',province:'50'},actor),null);
});
