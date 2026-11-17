import assert from 'node:assert/strict';
import {dispatchTrustedApi} from '../src/api/routes/ProtectedRouter.js';
const request=(group,action,payload={})=>({apiVersion:'v1',group,action,payload});
const repo={
 lookupByBusinessKey(key){return {key};},
 submitRegistrationAtomic(p){return {status:'PENDING_APPROVAL',key:p.businessKey};},
 approveRetentionAtomic(id){return {jobId:id,status:'DELETION_APPROVED'};}
};
const context={trustedBoundary:true,repository:repo,principal:{userId:'staff-1',permissions:['vehicle.lookup']}};
assert.equal(dispatchTrustedApi(request('vehicles','lookup',{plate:'กข 1234',province:'TH-10'}),context).data.key,'กข1234|TH-10');
assert.equal(dispatchTrustedApi(request('vehicles','lookup',{plate:'กข 1234',province:'TH-10'}),{}).ok,false);
assert.equal(dispatchTrustedApi(request('vehicles','lookup',{plate:'กข 1234',province:'TH-10'}),{...context,principal:null}).error.code,'FORBIDDEN');
assert.equal(dispatchTrustedApi(request('retention','approve',{jobId:'job-1'}),context).error.code,'FORBIDDEN');
assert.equal(dispatchTrustedApi(request('retention','approve',{jobId:'job-1'}),{...context,principal:{userId:'admin',permissions:['retention.delete.approve']}}).ok,true);
assert.equal(dispatchTrustedApi(request('registrations','submit',{}),context).error.code,'CAMPAIGN_NOT_VERIFIED');
assert.equal(dispatchTrustedApi(request('registrations','submit',{plate:'กข 1234',province:'TH-10',photos:[]}),{...context,campaignVerified:true}).error.code,'FIVE_PHOTOS_REQUIRED');
assert.equal(dispatchTrustedApi(request('vehicles','lookup',{plate:'กข 1234',province:'TH-10',principal:{permissions:['retention.delete.approve']}}),{...context,principal:null}).error.code,'FORBIDDEN');
console.log('Protected API contract tests passed');


const expandedPermissions=['vehicle.registration.approve','vehicle.history.read','vehicle.update','vehicle.contact.read','vehicle.change.approve','qr.manage','vehicle.photos.read','retention.read','audit.read'];
const mockMethods=['listPendingRegistrations','getRegistration','getVehicleHistory','updateVehicleAtomic','getVehicleContact','updateVehicleContactAtomic','listPendingChanges','reviewChangeAtomic','issueQrAtomic','replaceQrAtomic','listPhotos','replacePhotoAtomic','listDueRetention','getRetentionJob','queryAudit','exportAudit'];
const expandedRepo=Object.fromEntries(mockMethods.map(name=>[name,(...args)=>({method:name,args:args.slice(0,-1)})]));
const privileged={trustedBoundary:true,repository:expandedRepo,principal:{userId:'staff',permissions:expandedPermissions}};
const cases=[
 ['registrations','listPending',{},'listPendingRegistrations'],
 ['registrations','detail',{requestId:'r1'},'getRegistration'],
 ['vehicles','history',{vehicleId:'v1'},'getVehicleHistory'],
 ['vehicles','update',{vehicleId:'v1'},'updateVehicleAtomic'],
 ['contacts','read',{vehicleId:'v1'},'getVehicleContact'],
 ['contacts','update',{vehicleId:'v1'},'updateVehicleContactAtomic'],
 ['changes','listPending',{},'listPendingChanges'],
 ['changes','review',{requestId:'r1'},'reviewChangeAtomic'],
 ['qr','issue',{vehicleId:'v1'},'issueQrAtomic'],
 ['qr','replace',{vehicleId:'v1'},'replaceQrAtomic'],
 ['photos','list',{vehicleId:'v1'},'listPhotos'],
 ['photos','replace',{vehicleId:'v1'},'replacePhotoAtomic'],
 ['retention','listDue',{},'listDueRetention'],
 ['retention','jobStatus',{jobId:'j1'},'getRetentionJob'],
 ['audit','query',{},'queryAudit'],
 ['audit','export',{},'exportAudit']
];
for(const [group,action,payload,method] of cases){
 const result=dispatchTrustedApi(request(group,action,payload),privileged);
 assert.equal(result.ok,true,group+'.'+action+': '+JSON.stringify(result.error));
 assert.equal(result.data.method,method);
 assert.equal(dispatchTrustedApi(request(group,action,payload),{...privileged,principal:{userId:'none',permissions:[]}}).error.code,'FORBIDDEN');
}
