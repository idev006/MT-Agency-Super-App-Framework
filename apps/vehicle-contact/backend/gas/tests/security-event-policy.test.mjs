import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateSecurityEventDraft,SECURITY_EVENT_TYPES} from '../src/domain/policies/SecurityEventPolicy.js';
const valid={event_type:'ACCESS_DENIED',occurred_at:'2026-11-17T12:00:00Z',correlation_id:'req-1',decision:'DENY',actor_ref:'actor-pseudonym'};
test('synthetic security event policy accepts minimally scoped metadata',()=>{
  assert.ok(SECURITY_EVENT_TYPES.includes('AUTH_LOGIN_FAILURE'));
  assert.deepEqual(validateSecurityEventDraft(valid),{valid:true,errors:[]});
});
test('rejects secrets, tokens, personal data and unapproved fields',()=>{
  for(const field of ['password','raw_token','phone_e164','raw_ip','payload','authorization','unexpected']){
    const r=validateSecurityEventDraft({...valid,[field]:'sensitive'});
    assert.equal(r.valid,false,field);
  }
});
test('rejects missing or untrusted timestamp, event and correlation identifiers',()=>{
  for(const change of [{occurred_at:'17/11/2026'},{occurred_at:'2026-11-17T12:00:00+07:00'},{event_type:'ANYTHING'},{correlation_id:'bad value'},{decision:'ADMIN'}]){
    assert.equal(validateSecurityEventDraft({...valid,...change}).valid,false);
  }
});
test('rejects nested values in event references and arrays',()=>{
  assert.equal(validateSecurityEventDraft({...valid,actor_ref:{id:'x'}}).valid,false);
  assert.equal(validateSecurityEventDraft([]).valid,false);
});
