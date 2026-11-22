// Synthetic backend acceptance fixture: real Router/Controller/UseCases/SessionService;
// in-memory Sheets-shaped repository and fake Drive only. No live PII or credentials.
import {createHash} from 'node:crypto';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';
import {createApiRouter} from '../src/api/routes/Router.js';
import {createOperationController} from '../src/api/controllers/OperationController.js';
import {createSessionService} from '../src/application/security/SessionService.js';
export const PHOTO_SLOTS=['FRONT','REAR','LEFT','RIGHT','FRONT_ANGLE'];
export const SAMPLE_PASSWORD='Synthetic-Staging-Password-2026!';
export const FIXED_NOW='2026-11-17T12:00:00.000Z';
export function createAcceptanceHarness(){
 const tables=new Map(Object.keys(DATABASE_SCHEMA.tables).map(t=>[t,[]]));
 const io={locks:0,writes:0,driveUploads:0,driveDeletes:0};
 let current=FIXED_NOW, counter=100,throwOnDriveTrash=false,throwOnTableWrite=null,throwOnceOnTableWrite=null,writeFailAfter=null,writeFailAfterOnce=null;
 const id=()=>String(++counter).padStart(64,'0');
 const sha256=x=>createHash('sha256').update(String(x)).digest('hex');
 const copy=x=>structuredClone(x);
 const data=t=>{if(!tables.has(t))throw Error('UNKNOWN_TABLE:'+t);return tables.get(t);};
 const where=(row,filter)=>Object.entries(filter||{}).every(([k,v])=>row[k]===v);
 const schema=t=>DATABASE_SCHEMA.tables[t].columns;
 const failWrite=t=>{
  if(throwOnceOnTableWrite===t){throwOnceOnTableWrite=null;throw Error('TEST_INJECTED_STORE_WRITE_FAILURE');}
  if(writeFailAfterOnce!==null&&io.writes===writeFailAfterOnce){writeFailAfterOnce=null;throw Error('TEST_INJECTED_STORE_WRITE_FAILURE');}
  if(throwOnTableWrite===t||(writeFailAfter!==null&&io.writes===writeFailAfter))throw Error('TEST_INJECTED_STORE_WRITE_FAILURE');
 };
 const store={
  one(t,filter){const r=data(t).filter(x=>where(x,filter));if(r.length>1)throw Error('DUPLICATE_KEY');return r.length?copy(r[0]):null;},
  list(t,filter={},limit=5000){if(!Number.isSafeInteger(limit)||limit<1||limit>5000)throw Error('INVALID_LIMIT');return copy(data(t).filter(x=>where(x,filter)).slice(0,limit));},
  listNewest(t,filter={},limit=5000){return copy(data(t).filter(x=>where(x,filter)).slice(-limit));},
  insert(t,row){
   failWrite(t);
   const cols=schema(t);
   for(const c of cols)if(c.required&&(row[c.name]===undefined||row[c.name]===''))throw Error('REQUIRED_FIELD:'+c.name);
   for(const k of Object.keys(row))if(!cols.some(c=>c.name===k))throw Error('UNKNOWN_COLUMN:'+t+'.'+k);
   const key=cols.find(c=>c.key==='primary')?.name;
   if(key&&data(t).some(r=>r[key]===row[key]))throw Error('DUPLICATE_KEY');
   data(t).push(copy(row));io.writes++;return copy(row);
  },
  update(t,filter,patch){
   failWrite(t);
   if(Object.keys(patch||{}).some(k=>!schema(t).some(c=>c.name===k)))throw Error('INVALID_PATCH');
   const hits=data(t).filter(x=>where(x,filter));
   if(hits.length!==1)throw Error(hits.length?'DUPLICATE_KEY':'NOT_FOUND');
   Object.assign(hits[0],copy(patch));io.writes++;return copy(hits[0]);
  },
  remove(t,filter){
   failWrite(t);
   const hits=data(t).filter(x=>where(x,filter));
   if(hits.length!==1)throw Error(hits.length?'DUPLICATE_KEY':'NOT_FOUND');
   data(t).splice(data(t).indexOf(hits[0]),1);io.writes++;return true;
  },
  withLock(fn){io.locks++;return fn();},
  sequence(fn){return fn();}
 };
 const security={
  now:()=>current,secretToken:id,sha256,deriveSecret:purpose=>sha256('fixture-derived:'+purpose),
  hashPassword:p=>{if(typeof p!=='string'||p.length<12||p.length>128)throw Error('INVALID_PASSWORD');return 'test-only:'+p;},
  verifyPassword:(p,stored)=>stored==='test-only:'+p,
  verifyGoogle:token=>{if(token!=='signed-oidc-for-fixture')throw Error('INVALID_GOOGLE_TOKEN');return{sub:'oidc-test-sub-1'};}
 };
 const driveState=new Map(),deletedFiles=new Set();
 const drivePhotos={
  upload(base64,mime){io.driveUploads++;const ref='staging-media-'+id().slice(-6);driveState.set(ref,{base64,mime});return{storage_ref:ref,mime_type:mime,size_bytes:200};},
  read(ref){const f=driveState.get(ref);if(!f)throw Error('NOT_FOUND');return{base64Image:f.base64,mime_type:f.mime,size_bytes:200};},
  trash(ref){if(throwOnDriveTrash)throw Error('TEST_DRIVE_FAILURE');io.driveDeletes++;deletedFiles.add(ref);driveState.delete(ref);return true;}
 };
 const actors=[
  ['sys','SYSTEM_ADMIN'],['reg','REGISTRATION_ADMIN'],['staff','STAFF'],
  ['owner','OWNER'],['worker','RETENTION_WORKER']
 ];
 store.insert('vc_settings',{key:'idle_timeout_minutes',value:'30',updated_at:current,updated_by:'fixture'});
 store.insert('vc_settings',{key:'retention_days',value:'1',updated_at:current,updated_by:'fixture'});
 for(const [name,role]of actors){
  store.insert('vc_users',{user_id:'u-'+name,username_normalized:name,display_name:'Test '+name,
   password_hash:'test-only:'+SAMPLE_PASSWORD,password_salt:'',password_change_required:false,status:'ACTIVE',org_id:'',created_at:current,updated_at:current});
  store.insert('vc_user_roles',{assignment_id:id(),user_id:'u-'+name,role_id:role,status:'ACTIVE'});
 }
 const sessions=createSessionService({store,security}),tokens={};
 for(const [name]of actors)tokens[name]=sessions.issue(store.one('vc_users',{user_id:'u-'+name})).sessionToken;
 const router=createApiRouter({createProtectedDispatcher:()=>createOperationController({store,security,sessions,drivePhotos,allowDestructiveRetention:true})});
 const call=(operation,payload={},actor=null,options={})=>{
  const [group,...actions]=operation.split('.');
  const action=actions.join('.');
  return router.dispatch({apiVersion:options.version||'v1',group,action,payload,
   ...(actor?{sessionToken:tokens[actor]}:{}),requestId:'syntheticAcceptance'},options.method||'POST');
 };
 const as=(actor,operation,payload)=>call(operation,payload,actor);
 const seed=(t,rows)=>{for(const r of rows)store.insert(t,r);};
 const read=t=>store.list(t);
 function stagePhotos(campaignToken){
  const photos=[];
  for(const slot of PHOTO_SLOTS){
   const r=call('photos.upload',{campaignToken,slot,base64Image:'AAAA-binary-fake',mimeType:'image/png'});
   if(!r.ok)throw Error('photos.upload failed: '+JSON.stringify(r));
   photos.push({slot,photoId:r.data.photoId});
  }
  return photos;
 }
 const registrationPayload=(campaignToken,organizationId,photos,extra={})=>({
  campaignToken,plate:'กข 1234',province:'TH-10',plateType:'PRIVATE',vehicleType:'SEDAN',
  brand:'TestMake',model:'TestModel',color:'Blue',organizationId,relationship:'AUTHORIZED_CONTACT',
  contactName:'Synthetic Person',contactPhone:'+66810000001',
  photos,idempotencyKey:'acceptance-submit-001',...extra
 });
 function createCampaign(){
  const c=as('sys','campaigns.create',{startsAt:'2026-11-17T00:00:00.000Z',endsAt:'2026-11-20T00:00:00.000Z',maxSubmissions:5});
  if(!c.ok)throw Error('createCampaign: '+JSON.stringify(c));return c.data;
 }
 function createOrganization(){
  const o=as('sys','organizations.create',{name:'Synthetic Region Six',type:'POLICE'});
  if(!o.ok)throw Error('createOrganization: '+JSON.stringify(o));return o.data.organizationId;
 }
 return{call,as,store,security,sessions,tokens,seed,read,io,drivePhotos,driveState,deletedFiles,
  stagePhotos,registrationPayload,createCampaign,createOrganization,
  now:()=>current,setTime:x=>current=x,
  setDriveTrashFail:b=>throwOnDriveTrash=b,setWriteFailure:t=>throwOnTableWrite=t,
  setWriteFailureOnce:t=>throwOnceOnTableWrite=t,setWriteFailAfter:n=>writeFailAfter=n,setWriteFailAfterOnce:n=>writeFailAfterOnce=n};
}
export function assertOk(assert,response,context){
 assert.equal(response.ok,true,context+': '+JSON.stringify(response.error||response));
 return response.data;
}
export function assertError(assert,response,code,context){
 assert.equal(response.ok,false,context+': expected error, got '+JSON.stringify(response));
 assert.equal(response.error?.code,code,context+': '+JSON.stringify(response.error));
 assert.equal(response.data,null);
}
