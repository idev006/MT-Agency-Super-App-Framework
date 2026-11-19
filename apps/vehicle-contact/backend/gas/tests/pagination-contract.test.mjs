import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {ALLOWED_PAGE_SIZES,paginate} from '../src/application/pagination/Pagination.js';
import {createAcceptanceHarness,assertOk,assertError} from './acceptance-fixture.mjs';

const contract=JSON.parse(readFileSync(resolve(import.meta.dirname,'../../../contracts/list-pagination.v1.json'),'utf8'));

test('pagination SSOT defines the exact page sizes and stable metadata',()=>{
 assert.deepEqual(ALLOWED_PAGE_SIZES,[1,5,10,15,25,50,100]);
 assert.deepEqual(contract.request.allowedPageSizes,ALLOWED_PAGE_SIZES);
 assert.deepEqual(paginate(['a','b','c'],{page:2,pageSize:1}),{items:['b'],total:3,page:2,pageSize:1,totalPages:3});
 assert.deepEqual(paginate([],{page:1,pageSize:5}),{items:[],total:0,page:1,pageSize:5,totalPages:0});
 assert.deepEqual(paginate(['a','b'],{limit:1}),['a'],'legacy limit remains temporarily compatible');
 for(const payload of [{page:1},{pageSize:5},{page:0,pageSize:5},{page:1,pageSize:2},{page:1,pageSize:5,limit:5}])
  assert.throws(()=>paginate(['a'],payload),/INVALID_PAGINATION/);
});

test('all table-list operations return server pagination envelopes and reject unsupported sizes',()=>{
 const h=createAcceptanceHarness();
 h.as('sys','organizations.create',{name:'Org One',type:'POLICE'});
 h.as('sys','organizations.create',{name:'Org Two',type:'EXTERNAL'});
 h.as('sys','campaigns.create',{startsAt:'2026-11-17T00:00:00.000Z',endsAt:'2026-11-20T00:00:00.000Z',maxSubmissions:5});
 h.as('sys','campaigns.create',{startsAt:'2026-11-18T00:00:00.000Z',endsAt:'2026-11-21T00:00:00.000Z',maxSubmissions:10});
 h.seed('vc_registration_requests',[
  {request_id:'reg-1',vehicle_id:'v-1',status:'PENDING_APPROVAL',submitted_at:'2026-11-17T01:00:00.000Z'},
  {request_id:'reg-2',vehicle_id:'v-2',status:'PENDING_APPROVAL',submitted_at:'2026-11-17T02:00:00.000Z'}
 ]);
 h.seed('vc_change_requests',[
  {change_id:'change-1',vehicle_id:'v-1',status:'PENDING',submitted_at:'2026-11-17T03:00:00.000Z'},
  {change_id:'change-2',vehicle_id:'v-2',status:'PENDING',submitted_at:'2026-11-17T04:00:00.000Z'}
 ]);
 h.seed('vc_retention_jobs',[
  {job_id:'job-1',vehicle_id:'v-1',due_at:'2026-11-16T00:00:00.000Z',status:'WAITING_RETENTION',legal_hold:false},
  {job_id:'job-2',vehicle_id:'v-2',due_at:'2026-11-16T00:00:00.000Z',status:'WAITING_RETENTION',legal_hold:false}
 ]);
 h.seed('vc_change_audit',[
  {audit_id:'audit-1',actor_id:'u-sys',entity_id:'v-1',action:'ONE',created_at:'2026-11-17T01:00:00.000Z'},
  {audit_id:'audit-2',actor_id:'u-sys',entity_id:'v-2',action:'TWO',created_at:'2026-11-17T02:00:00.000Z'}
 ]);
 const cases=[
  ['sys','users.list'],['sys','organizations.list'],['sys','campaigns.list'],
  ['reg','registrations.listPending'],['reg','changes.listPending'],
  ['sys','retention.listDue'],['sys','audit.query']
 ];
 for(const [actor,operation] of cases){
  const page=assertOk(assert,h.as(actor,operation,{page:1,pageSize:1}),operation);
  assert.deepEqual(Object.keys(page),['items','total','page','pageSize','totalPages']);
  assert.equal(page.items.length,1);assert.ok(page.total>=2);assert.equal(page.page,1);assert.equal(page.pageSize,1);
  assert.equal(page.totalPages,page.total);
  assertError(assert,h.as(actor,operation,{page:1,pageSize:2}),'INVALID_PAGINATION',operation+' rejects unsupported size');
 }
 assert.ok(Array.isArray(assertOk(assert,h.as('sys','users.list',{}),'legacy users list')));
 for(const size of ALLOWED_PAGE_SIZES)
  assert.equal(assertOk(assert,h.as('sys','users.list',{page:1,pageSize:size}),'allowed size '+size).pageSize,size);
});
