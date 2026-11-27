// references.registration + the submit-time reference check — the rules live in application/flows/RegistrationFlows.js
// (phase 3 wave 2a), one source with the Node core. memo: the host's process memo for the 645 reference rows (Cloud Run:
// a few minutes; GAS: none).
import {referencesFlow,referencesRegistrationFlow,assertRegistrationAgainst} from '../flows/RegistrationFlows.js';
import {runFlowSync} from '../flows/FlowRunner.js';
export function createReferenceOperations({store,security,memo=null}){
 const deps=Object.freeze({now:()=>security.now(),id:()=>security.secretToken(),sha256:x=>security.sha256(x)});
 const memoPort=memo?{get:()=>memo.get(),put:(_key,value)=>memo.put(value)}:null;
 const run=flow=>runFlowSync(flow,{store,memo:memoPort});
 const get=p=>run(referencesRegistrationFlow(p||{},deps));
 const assertRegistration=payload=>assertRegistrationAgainst(run(referencesFlow(deps)).refs,payload);
 return Object.freeze({'references.registration':get,assertRegistration});
}
