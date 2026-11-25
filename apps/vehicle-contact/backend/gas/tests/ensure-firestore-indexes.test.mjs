// Firestore indexes as code: adds only what the SSOT declares and is missing; never deletes; gated.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {ensureIndexes, INDEX_GATE, INDEX_SSOT} from '../scripts/ensure-firestore-indexes.mjs';

const keyFile=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'p6vc-ix-')),'k.json');fs.writeFileSync(keyFile,JSON.stringify({project_id:'p'}));
const env={P6VC_ALLOW_INDEX_ADMIN:INDEX_GATE,GOOGLE_APPLICATION_CREDENTIALS:keyFile};
function fake(liveCount){
 const live=INDEX_SSOT.indexes.slice(0,liveCount).map(i=>({name:`p/collectionGroups/${i.collection}/indexes/x`,state:'READY',fields:[...i.fields,{fieldPath:'__name__',order:'ASCENDING'}]}));
 const posts=[],deletes=[];
 return {posts,deletes,request:async({url,method='GET',data})=>{
  if(method==='DELETE'){deletes.push(url);return {data:{}};}
  if(method==='POST'){posts.push({coll:url.split('/collectionGroups/')[1].split('/')[0],data});live.push({name:`p/collectionGroups/${url.split('/collectionGroups/')[1].split('/')[0]}/indexes/n`,state:'READY',fields:data.fields});return {data:{}};}
  return {data:{indexes:live}};}};
}
test('IX-01 gate required; dry run reports missing without writing',async()=>{
 assert.equal((await ensureIndexes({env:{},client:fake(0)})).reason,'MISSING_INDEX_GATE');
 const c=fake(INDEX_SSOT.indexes.length-2);
 const r=await ensureIndexes({env,client:c});
 assert.equal(r.status,'MISSING');assert.equal(r.missing.length,2);assert.equal(c.posts.length,0);
});
test('IX-02 apply creates only the missing ones, never deletes, ends PASS when READY',async()=>{
 const c=fake(INDEX_SSOT.indexes.length-3);
 const r=await ensureIndexes({env,client:c,apply:true,sleep:async()=>{}});
 assert.equal(r.status,'PASS');assert.equal(c.posts.length,3);assert.equal(c.deletes.length,0);
 assert.ok(c.posts.every(p=>p.data.fields.at(-1).fieldPath==='_seq'));
 const again=await ensureIndexes({env,client:c,apply:true,sleep:async()=>{}});
 assert.equal(again.status,'PASS');assert.equal(c.posts.length,3,'idempotent');
});
