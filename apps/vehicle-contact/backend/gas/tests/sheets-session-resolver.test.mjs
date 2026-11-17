import assert from 'node:assert/strict';
import {createSessionResolver} from '../src/infrastructure/persistence/sheets/SheetsSessionResolver.js';
const token='a'.repeat(64),digest='b'.repeat(64),now='2026-11-17T12:00:00.000Z';
const rows={
 vc_sessions:[['user_id','token_digest','status','issued_at','expires_at','last_seen_at','idle_timeout_minutes'],['u1',digest,'ACTIVE','2026-11-17T11:00:00.000Z','2026-11-17T19:00:00.000Z','2026-11-17T11:55:00.000Z',30]],
 vc_users:[['user_id','status','password_change_required'],['u1','ACTIVE',false]],
 vc_user_permissions:[['user_id','permission','status'],['u1','vehicle.lookup','ACTIVE'],['u1','retention.delete.approve','REVOKED']]
};
const app={openById(){return {getSheetByName(name){return rows[name]?{getDataRange(){return {getValues(){return rows[name]}}}}:null}}}};
const resolver=createSessionResolver({spreadsheetApp:app,spreadsheetId:'test',sha256:t=>t===token?digest:'c'.repeat(64),now:()=>now});
assert.equal(resolver.authorize(token,'vehicle.lookup').userId,'u1');
assert.throws(()=>resolver.authorize('bad','vehicle.lookup'),/UNAUTHENTICATED/);
assert.throws(()=>resolver.authorize('c'.repeat(64),'vehicle.lookup'),/UNAUTHENTICATED/);
assert.throws(()=>resolver.authorize(token,'retention.delete.approve'),/FORBIDDEN/);
rows.vc_sessions.push([...rows.vc_sessions[1]]);
assert.throws(()=>resolver.authorize(token,'vehicle.lookup'),/UNAUTHENTICATED/);
rows.vc_sessions.pop();
rows.vc_users[1][1]='SUSPENDED';
assert.throws(()=>resolver.authorize(token,'vehicle.lookup'),/UNAUTHENTICATED/);
rows.vc_users[1][1]='ACTIVE';
rows.vc_sessions[1][4]=now;
assert.throws(()=>resolver.authorize(token,'vehicle.lookup'),/SESSION_EXPIRED/);
console.log('Sheets session resolver assertions PASSED');
