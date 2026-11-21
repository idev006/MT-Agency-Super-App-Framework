import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAcceptanceHarness,assertOk,assertError} from './acceptance-fixture.mjs';

const mk=(h,name,parentId)=>assertOk(assert,h.as('sys','organizations.create',
 {name,type:'POLICE',...(parentId?{parentId}:{})}),'create '+name).organizationId;
const org=(h,id)=>h.store.one('vc_organizations',{organization_id:id});

test('ORG-CYCLE-01: self-parent rejected',()=>{
 const h=createAcceptanceHarness(),a=mk(h,'A');
 assertError(assert,h.as('sys','organizations.update',{organizationId:a,parentId:a}),'INVALID_ORG_PARENT','self parent');
});

test('ORG-CYCLE-02: two-node ancestor cycle rejected',()=>{
 const h=createAcceptanceHarness(),a=mk(h,'A'),b=mk(h,'B',a);
 // b.parent=a already; setting a.parent=b would close a<->b
 assertError(assert,h.as('sys','organizations.update',{organizationId:a,parentId:b}),'INVALID_ORG_PARENT','2-node cycle');
 assert.equal(org(h,a).parent_id,'','rejected update must not mutate parent');
});

test('ORG-CYCLE-03: three-node ancestor cycle rejected',()=>{
 const h=createAcceptanceHarness(),a=mk(h,'A'),b=mk(h,'B',a),c=mk(h,'C',b);
 // chain c->b->a; setting a.parent=c closes the loop
 assertError(assert,h.as('sys','organizations.update',{organizationId:a,parentId:c}),'INVALID_ORG_PARENT','3-node cycle');
});

test('ORG-CYCLE-04: valid re-parent under unrelated root succeeds',()=>{
 const h=createAcceptanceHarness(),a=mk(h,'A'),b=mk(h,'B',a),root=mk(h,'Root');
 assertOk(assert,h.as('sys','organizations.update',{organizationId:b,parentId:root}),'re-parent');
 assert.equal(org(h,b).parent_id,root);
});

test('ORG-CYCLE-05: missing parent rejected',()=>{
 const h=createAcceptanceHarness(),a=mk(h,'A');
 assertError(assert,h.as('sys','organizations.update',{organizationId:a,parentId:'no-such-org'}),'PARENT_NOT_FOUND','missing parent');
});

test('ORG-CYCLE-06: pre-existing unrelated cycle terminates via visited guard',()=>{
 const h=createAcceptanceHarness();
 const t='2026-11-17T00:00:00.000Z';
 h.seed('vc_organizations',[
  {organization_id:'x',name:'X',org_type:'POLICE',parent_id:'y',status:'ACTIVE',created_at:t,updated_at:t},
  {organization_id:'y',name:'Y',org_type:'POLICE',parent_id:'x',status:'ACTIVE',created_at:t,updated_at:t},
  {organization_id:'z',name:'Z',org_type:'POLICE',parent_id:'',status:'ACTIVE',created_at:t,updated_at:t}
 ]);
 // walking up from x visits x->y->x(seen) and terminates without ever reaching z
 assertOk(assert,h.as('sys','organizations.update',{organizationId:'z',parentId:'x'}),'attach below cyclic subtree terminates');
 assert.equal(org(h,'z').parent_id,'x');
});

test('ORG-CYCLE-07: name-only update preserves parent (parentId undefined skips cycle check)',()=>{
 const h=createAcceptanceHarness(),a=mk(h,'A'),b=mk(h,'B',a);
 assertOk(assert,h.as('sys','organizations.update',{organizationId:b,name:'B Renamed'}),'name-only update');
 assert.equal(org(h,b).parent_id,a,'parent unchanged');
 assert.equal(org(h,b).name,'B Renamed');
});