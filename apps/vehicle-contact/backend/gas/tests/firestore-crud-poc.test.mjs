// Offline proof of the readable CRUD POC against a minimal fake of the Firestore REST
// document endpoints (POST ?documentId, GET, PATCH updateMask, DELETE, list, runQuery).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createFirestoreCrud,runFirestoreCrudPoc,CRUD_POC_COLLECTION} from '../src/infrastructure/persistence/firestore/FirestoreCrudPoc.js';
import {makeFakeUtilities,fakeServiceAccountKey} from './fake-firestore-rest-server.mjs';

function fakeDocsRest(){
  const docs=new Map(),reqs=[];
  const reply=(code,body)=>({getResponseCode:()=>code,getContentText:()=>body===undefined?'':JSON.stringify(body)});
  const err=(code,status)=>reply(code,{error:{code,status}});
  const doc=(name,fields)=>({name:'projects/p/databases/(default)/documents/'+name,fields});
  function fetch(url,o={}){
    reqs.push({url,method:o.method});
    if(url.startsWith('https://oauth2.googleapis.com/token'))return reply(200,{access_token:'t',expires_in:3600});
    const u=new URL(url),path=decodeURIComponent(u.pathname.split('/documents')[1]||''),m=(o.method||'get').toLowerCase();
    const body=o.payload?JSON.parse(o.payload):null;
    if(path===':runQuery'){
      const q=body.structuredQuery,f=q.where.fieldFilter;
      return reply(200,[...docs].filter(([n,fl])=>n.startsWith(q.from[0].collectionId+'/')&&JSON.stringify(fl[f.field.fieldPath])===JSON.stringify(f.value))
        .map(([n,fl])=>({document:doc(n,fl)})));
    }
    const [coll,id]=path.slice(1).split('/');
    if(!id&&m==='post'){const name=coll+'/'+u.searchParams.get('documentId');
      if(docs.has(name))return err(409,'ALREADY_EXISTS');docs.set(name,body.fields);return reply(200,doc(name,body.fields));}
    if(!id&&m==='get')return reply(200,{documents:[...docs].filter(([n])=>n.startsWith(coll+'/')).map(([n,f])=>doc(n,f))});
    const name=coll+'/'+id;
    if(!docs.has(name))return err(404,'NOT_FOUND');
    if(m==='get')return reply(200,doc(name,docs.get(name)));
    if(m==='patch'){const next={...docs.get(name)};for(const p of u.searchParams.getAll('updateMask.fieldPaths'))next[p]=body.fields[p];
      docs.set(name,next);return reply(200,doc(name,next));}
    if(m==='delete'){docs.delete(name);return reply(200,{});}
    return err(400,'INVALID_ARGUMENT');
  }
  return {fetch,docs,reqs};
}

test('CRUD POC passes all 7 read-back-verified steps and leaves no residue',()=>{
  const fake=fakeDocsRest();
  const crud=createFirestoreCrud({utilities:makeFakeUtilities(),urlFetchApp:fake,key:fakeServiceAccountKey()});
  const result=runFirestoreCrudPoc(crud,{newId:randomUUID});
  assert.equal(result.status,'PASS',JSON.stringify(result));
  assert.equal(result.passed,7);
  assert.equal(fake.docs.size,0,'cleaned up');
  assert.equal(fake.reqs.filter(r=>r.url.includes('oauth2')).length,1,'token fetched once per execution');
});

test('masked update keeps untouched fields; FAIL result is reported, not thrown, and still cleans up',()=>{
  const fake=fakeDocsRest();
  const crud=createFirestoreCrud({utilities:makeFakeUtilities(),urlFetchApp:fake,key:fakeServiceAccountKey()});
  crud.create('c','x',{a:1,b:'keep'});
  assert.deepEqual(crud.update('c','x',{a:2}),{_id:'x',a:2,b:'keep'});
  const broken={...crud,whereEqual:()=>[]};
  const result=runFirestoreCrudPoc(broken,{newId:()=>'fixed'});
  assert.equal(result.status,'FAIL');
  assert.match(result.error,/QUERY/);
  assert.equal(crud.get(CRUD_POC_COLLECTION,'poc-fixed'),null,'cleanup ran after failure');
});
