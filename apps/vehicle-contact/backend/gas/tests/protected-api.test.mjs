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
