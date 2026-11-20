import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReferenceOperations} from '../src/application/use-cases/ReferenceOperations.js';
import {createVehicleOperations} from '../src/application/use-cases/VehicleOperations.js';
const security={sha256:value=>createHash('sha256').update(value).digest('hex'),now:()=>new Date(0).toISOString(),secretToken:()=> 'token'};
const row=(catalog,code,extra={})=>({reference_id:catalog+'-'+code,catalog,code,label_th:code,parent_code:'',sort_order:0,status:'ACTIVE',...extra});
const complete=()=>[
 row('PROVINCE','BKK'),row('PLATE_TYPE','PRIVATE'),row('VEHICLE_TYPE','CAR'),row('RELATIONSHIP','OWNER'),
 row('BRAND','TOYOTA'),row('MODEL','YARIS',{parent_code:'TOYOTA'}),row('COLOR','WHITE')
];
function store(rows=complete(),enforcement='ADVISORY'){
 return {list(table){if(table==='vc_reference_values')return rows;if(table==='vc_organizations')return [{organization_id:'ORG-1',name:'องค์กร 1',status:'ACTIVE'},{organization_id:'ORG-X',name:'ปิด',status:'INACTIVE'}];return[];},
  one(table){if(table==='vc_settings')return {value:enforcement};return null;}};
}
test('registration reference response is active, normalized, deterministic and versioned',()=>{
 const rows=[...complete(),row('PROVINCE','OLD',{status:'INACTIVE'}),row('COLOR','BLACK',{sort_order:1})];
 const op=createReferenceOperations({store:store(rows),security})['references.registration'];
 const a=op(),b=op();
 assert.deepEqual(a,b);assert.equal(a.mode,'ADVISORY');assert.equal(a.version.length,64);
 assert.deepEqual(a.lists.provinces,[{code:'BKK',label:'BKK'}]);
 assert.deepEqual(a.lists.models,[{code:'YARIS',label:'YARIS',parentCode:'TOYOTA'}]);
 assert.deepEqual(a.organizations,[{code:'ORG-1',label:'องค์กร 1'}]);
 assert.equal(a.policies.provinces,'ADVISORY');assert.equal(a.policies.organizations,'ADVISORY');
 const reordered=createReferenceOperations({store:store(rows.slice().reverse()),security})['references.registration']();
 assert.equal(reordered.version,a.version,'sheet row order must not change the catalog version');
});
test('catalog rejects duplicate code, duplicate id, formula label and orphan model',()=>{
 for(const rows of [
  [...complete(),row('PROVINCE','BKK',{reference_id:'other'})],
  [...complete(),row('COLOR','BLUE',{reference_id:'PROVINCE-BKK'})],
  complete().map((x,i)=>i?x:{...x,label_th:'=IMPORTDATA()'}),
  complete().map(x=>x.catalog==='MODEL'?{...x,parent_code:'UNKNOWN'}:x)
 ])assert.throws(()=>createReferenceOperations({store:store(rows),security})['references.registration'](),/REFERENCE_DATA_INVALID/);
});
test('catalog is bounded and legacy mode tolerates incomplete additive migration',()=>{
 const excessive=Array.from({length:5001},(_,i)=>row('COLOR','C'+i));
 assert.throws(()=>createReferenceOperations({store:store(excessive),security})['references.registration'](),/REFERENCE_DATA_BOUNDS/);
 const legacy=createReferenceOperations({store:store([row('PROVINCE','BKK')]),security});
 assert.equal(legacy['references.registration']().mode,'LEGACY');
 assert.doesNotThrow(()=>legacy.assertRegistration({referenceVersion:'legacy-client-version'}));
});
test('enforced catalog validates version, strict active codes and authoritative organization',()=>{
 const refs=createReferenceOperations({store:store(complete(),'ENFORCED'),security}),catalog=refs['references.registration']();
 assert.equal(catalog.mode,'ENFORCED');
 const payload={referenceVersion:catalog.version,province:'BKK',plateType:'PRIVATE',vehicleType:'CAR',relationship:'OWNER',organizationId:'ORG-1'};
 assert.doesNotThrow(()=>refs.assertRegistration(payload));
 assert.throws(()=>refs.assertRegistration({...payload,referenceVersion:'old'}),/REFERENCE_VERSION_STALE/);
 assert.throws(()=>refs.assertRegistration({...payload,province:'OLD'}),/INVALID_REFERENCE_VALUE/);
 assert.throws(()=>refs.assertRegistration({...payload,organizationId:'ORG-X'}),/ORGANIZATION_INACTIVE/);
});
test('registration rejects reference failure before campaigns or persistence writes',()=>{
 let writes=0,campaignCalls=0;
 const fakeStore={withLock(fn){return fn();},insert(){writes++;},update(){writes++;},remove(){writes++;},one(){return null;},list(){return[];}};
 const operations=createVehicleOperations({store:fakeStore,security,campaigns:{getCampaign(){campaignCalls++;}},references:{assertRegistration(){throw new Error('INVALID_REFERENCE_VALUE');}}});
 const payload={campaignToken:'c',plate:'กก 1',province:'BKK',plateType:'PRIVATE',vehicleType:'CAR',brand:'X',model:'Y',color:'Z',organizationId:'ORG-1',relationship:'OWNER',contactName:'Name',contactPhone:'+661234567',photos:[],idempotencyKey:'key'};
 assert.throws(()=>operations['registrations.submit'](payload),/INVALID_REFERENCE_VALUE/);
 assert.equal(campaignCalls,0);assert.equal(writes,0);
});
