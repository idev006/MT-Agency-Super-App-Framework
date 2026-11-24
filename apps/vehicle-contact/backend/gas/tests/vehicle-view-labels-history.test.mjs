// E2E 2026-11-24 findings: the vehicle card showed reference codes (RY01/WHITE) and an empty history
// for a freshly approved vehicle (the approval was audited under the REQUEST id only).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFirestoreStore} from '../src/infrastructure/persistence/firestore/FirestoreStore.js';
import {createFirestoreRestGateway} from '../src/infrastructure/persistence/firestore/FirestoreRestGateway.js';
import {createVehicleOperations} from '../src/application/use-cases/VehicleOperations.js';
import {createFakeFirestoreRest,makeFakeUtilities,fakeServiceAccountKey,PROJECT,DATABASE} from './fake-firestore-rest-server.mjs';

const AT='2026-11-24T00:00:00.000Z';
function boot(){
  const fake=createFakeFirestoreRest(),key=fakeServiceAccountKey();
  const gw=createFirestoreRestGateway({utilities:makeFakeUtilities(),urlFetchApp:fake,clientEmail:key.client_email,
    privateKey:key.private_key,projectId:PROJECT,databaseId:DATABASE,clock:()=>AT});
  const store=createFirestoreStore({firestore:gw});
  let n=0;
  const security={now:()=>AT,secretToken:()=>'t'+String(++n).padStart(63,'0'),sha256:v=>'h'+String(v).length,deriveSecret:p=>'d:'+p};
  const ops=createVehicleOperations({store,security,campaigns:{},references:{}});
  for(const [catalog,code,label] of [['VEHICLE_TYPE','RY01','รถยนต์นั่งส่วนบุคคลไม่เกิน 7 คน'],['COLOR','WHITE','ขาว'],['PLATE_TYPE','STANDARD','ป้ายทะเบียนปกติ']])
    store.insert('vc_reference_values',{reference_id:'REF-'+catalog+'-'+code,catalog,code,label_th:label,parent_code:'',sort_order:1,status:'ACTIVE',updated_by:'seed',updated_at:AT});
  const photos=['FRONT','REAR','LEFT','RIGHT','FRONT_ANGLE'].map((slot,i)=>({photoId:'p'+i,slot,storageRef:'ref'+i,mimeType:'image/jpeg',sizeBytes:10}));
  store.insert('vc_registration_requests',{request_id:'r1',vehicle_id:'v1',campaign_id:'c1',status:'PENDING_APPROVAL',submitted_at:AT,reviewed_by:'',reviewed_at:'',
    idempotency_key:'k1',application_json:JSON.stringify({plate_normalized:'ฮฮ0154',province_code:'65',plate_type:'STANDARD',vehicle_type:'RY01',make:'TOYOTA',
    model:'X',color:'WHITE',organization_id:'o',relationship:'OWNER',contactName:'N',contactPhone:'+66810000099',photos})});
  return {fake,store,ops};
}
const reader={userId:'staff',permissions:['vehicle.lookup','vehicle.contact.read','vehicle.photos.read','vehicle.history.read']};

test('VIEW-01 approval is visible in the vehicle history; labels come back with the view (one read round)',()=>{
  const {fake,store,ops}=boot();
  ops['registrations.review']({requestId:'r1',decision:'APPROVE',platePhotoVerified:true},{userId:'admin',permissions:['vehicle.registration.approve']});
  assert.equal(store.list('vc_change_audit',{entity_id:'v1'}).length,1,'approval audited under the vehicle id too');
  const r0=fake.state.rounds;
  const view=ops['vehicles.lookup']({plate:'ฮฮ 0154',province:'65'},reader);
  assert.deepEqual(view.labels,{vehicleType:'รถยนต์นั่งส่วนบุคคลไม่เกิน 7 คน',color:'ขาว',plateType:'ป้ายทะเบียนปกติ'});
  assert.equal(view.plateType,'STANDARD');
  assert.deepEqual(view.history.map(h=>h.action),['REGISTRATION_APPROVED']);
  assert.deepEqual(Object.keys(view.history[0]).sort(),['action','audit_id','created_at','redacted_summary'],'no actor ids leak');
  assert.ok(fake.state.rounds-r0<=4,'lookup query + audit insert + one parallel read round (+token)');
});

test('VIEW-02 no history permission → no history field; unknown codes → empty label, never a crash',()=>{
  const {store,ops}=boot();
  ops['registrations.review']({requestId:'r1',decision:'APPROVE',platePhotoVerified:true},{userId:'admin',permissions:['vehicle.registration.approve']});
  store.update('vc_vehicles',{vehicle_id:'v1'},{color:'NOT_IN_CATALOG'});
  const view=ops['vehicles.detail']({vehicleId:'v1'},{userId:'s',permissions:['vehicle.lookup']});
  assert.equal(view.history,undefined);
  assert.equal(view.labels.color,'');
  assert.equal(view.labels.vehicleType,'รถยนต์นั่งส่วนบุคคลไม่เกิน 7 คน');
});

import {createMediaRetentionOperations} from '../src/application/use-cases/MediaRetentionOperations.js';
test('VIEW-03 vehicles.photo returns an ACTIVE photo of an ACTIVE vehicle, logs the view as an access (not history)',()=>{
  const {store,ops}=boot();
  ops['registrations.review']({requestId:'r1',decision:'APPROVE',platePhotoVerified:true},{userId:'admin',permissions:['vehicle.registration.approve']});
  const reads=[];
  const drivePhotos={read:ref=>{reads.push(ref);return {mime_type:'image/jpeg',base64Image:'AAAA'};}};
  const media=createMediaRetentionOperations({store,security:{now:()=>AT,secretToken:()=>'x'+Math.random().toString(16).slice(2).padEnd(63,'0')},drivePhotos,campaigns:{}});
  const viewer={userId:'staff',permissions:['vehicle.photos.read']};
  const out=media['vehicles.photo']({vehicleId:'v1',photoId:'p0'},viewer);
  assert.deepEqual(out,{photoId:'p0',slot:'FRONT',mimeType:'image/jpeg',base64Image:'AAAA'});
  assert.deepEqual(reads,['ref0'],'reads the stored Drive ref');
  assert.equal(store.list('vc_lookup_audit',{vehicle_id:'v1'}).filter(a=>a.lookup_source==='PHOTO').length,1,'view logged');
  assert.equal(store.list('vc_change_audit',{entity_id:'v1'}).length,1,'history untouched (only the approval)');
  assert.throws(()=>media['vehicles.photo']({vehicleId:'v1',photoId:'nope'},viewer),/PHOTO_NOT_FOUND/);
  store.update('vc_vehicles',{vehicle_id:'v1'},{status:'INACTIVE'});
  assert.throws(()=>media['vehicles.photo']({vehicleId:'v1',photoId:'p0'},viewer),/VEHICLE_NOT_ACTIVE/);
});

test('VIEW-04 view carries agency name, registration/update dates and active-QR status (equality reads only)',()=>{
  const {store,ops}=boot();
  store.insert('vc_organizations',{organization_id:'o',name:'สภ.เมืองพิษณุโลก',org_type:'POLICE',parent_id:'',status:'ACTIVE',created_at:AT,updated_at:AT});
  ops['registrations.review']({requestId:'r1',decision:'APPROVE',platePhotoVerified:true},{userId:'admin',permissions:['vehicle.registration.approve']});
  const view=ops['vehicles.detail']({vehicleId:'v1'},reader);
  assert.deepEqual(view.organization,{id:'o',name:'สภ.เมืองพิษณุโลก'});
  assert.equal(view.registeredAt,AT);
  assert.equal(view.qr.active,true);
  store.update('vc_qr_tokens',{qr_id:store.list('vc_qr_tokens',{vehicle_id:'v1'})[0].qr_id},{status:'REVOKED'});
  assert.equal(ops['vehicles.detail']({vehicleId:'v1'},reader).qr.active,false);
  assert.deepEqual(view.labels.color,'ขาว','labels still mapped after the extra reads');
  assert.deepEqual(view.history.map(h=>h.action),['REGISTRATION_APPROVED']);
});
