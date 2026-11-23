import {REFERENCE_SEED_V1} from '../../domain/reference/ReferenceSeedV1.js';

// Trusted GAS Editor-only reference catalog seed. S1 (VC-ADR-029): targets the runtime store
// (Firestore) instead of the retired Sheets DB. Gates unchanged: preview never writes; apply
// requires the exact manifest checksum approval (consumed), seeds ONLY an empty table and
// read-back verifies; recover requires its own approval and removes ONLY seed-owned rows.
// The Sheets-era Drive backup copy is gone: apply only ever writes into an EMPTY table.
const TABLE='vc_reference_values';
const APPROVAL='VEHICLE_REFERENCE_SEED_APPROVED_SHA256';
const RECOVERY_APPROVAL='VEHICLE_REFERENCE_SEED_RECOVERY_APPROVED';
const JOURNAL='VEHICLE_REFERENCE_SEED_JOURNAL';
const SEED_REFERENCE_ID=/^REF-(PROVINCE|VEHICLE_TYPE|PLATE_TYPE|RELATIONSHIP|COLOR|BRAND)-/;
const FIELDS=Object.freeze(['reference_id','catalog','code','label_th','parent_code','sort_order','status','updated_by','updated_at']);
const COMMIT_CHUNK=400; // Firestore allows 500 writes per commit.
const invalid=code=>{throw new Error(code);};
const text=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/^[=+@-]/.test(value);
const hex=bytes=>Array.from(bytes,value=>(value&255).toString(16).padStart(2,'0')).join('');

export function createReferenceSeedInstaller({store,propertiesService,utilities,clock=()=>new Date().toISOString()}){
 if(!store||!propertiesService||!utilities)invalid('REFERENCE_SEED_NOT_CONFIGURED');
 const props=propertiesService.getScriptProperties();
 const canonical=JSON.stringify({seedVersion:REFERENCE_SEED_V1.seedVersion,schemaVersion:REFERENCE_SEED_V1.schemaVersion,rows:REFERENCE_SEED_V1.rows});
 const checksum=hex(utilities.computeDigest(utilities.DigestAlgorithm.SHA_256,canonical,utilities.Charset.UTF_8));
 const write=ops=>{
  if(typeof store.writeMany==='function')return store.writeMany(ops);
  for(const o of ops){if(o.op==='insert')store.insert(o.table,o.data);else store.remove(o.table,o.key);}
  return true;
 };
 function validateManifest(){
  const ids=new Set(),codes=new Set(),counts={};
  if(REFERENCE_SEED_V1.rows.length!==645||!/^[a-f0-9]{64}$/.test(checksum))invalid('REFERENCE_SEED_MANIFEST_INVALID');
  for(const row of REFERENCE_SEED_V1.rows){
   const key=row.catalog+'|'+row.code;
   if(!text(row.reference_id,100)||!text(row.catalog,32)||!text(row.code,64)||!text(row.label_th,120)
    ||row.parent_code!==''||!Number.isSafeInteger(row.sort_order)||row.sort_order<1
    ||row.status!=='ACTIVE'||row.updated_by!=='REFERENCE_SEED_V1'
    ||row.updated_at!=='2026-11-20T00:00:00.000Z'||ids.has(row.reference_id)||codes.has(key))
    invalid('REFERENCE_SEED_MANIFEST_INVALID');
   ids.add(row.reference_id);codes.add(key);counts[row.catalog]=(counts[row.catalog]||0)+1;
  }
  if(counts.PROVINCE!==77||counts.VEHICLE_TYPE!==17||counts.PLATE_TYPE!==5||counts.RELATIONSHIP!==6
   ||counts.COLOR!==16||counts.BRAND!==524||Object.keys(counts).length!==6)invalid('REFERENCE_SEED_MANIFEST_INVALID');
 }
 const canon=row=>JSON.stringify(FIELDS.map(f=>String(row[f]??'')));
 function inspect(){
  validateManifest();
  const existing=store.list(TABLE);
  if(!existing.length)return {status:'READY',addCount:REFERENCE_SEED_V1.rows.length,existingCount:0};
  const want=new Set(REFERENCE_SEED_V1.rows.map(canon));
  if(existing.length===want.size&&existing.every(row=>want.has(canon(row))))
   return {status:'ALREADY_APPLIED',addCount:0,existingCount:existing.length};
  return {status:'BLOCKED',addCount:0,existingCount:existing.length};
 }
 function result(state){return Object.freeze({
   status:state.status,seedVersion:REFERENCE_SEED_V1.seedVersion,schemaVersion:REFERENCE_SEED_V1.schemaVersion,
   checksum,rowCount:REFERENCE_SEED_V1.rows.length,addCount:state.addCount,existingCount:state.existingCount,
   mode:'ADVISORY',dataModified:false
  });}
 function preview(){return result(inspect());}
 function setJournal(state){props.setProperty(JOURNAL,JSON.stringify(state));}
 function apply(){
  if(props.getProperty(APPROVAL)!==checksum)invalid('REFERENCE_SEED_EXPLICIT_APPROVAL_REQUIRED');
  let state=null;
  try{
   const plan=inspect();
   if(plan.status==='ALREADY_APPLIED')return {...result(plan),status:'ALREADY_APPLIED'};
   if(plan.status!=='READY')invalid('REFERENCE_SEED_CONFLICT');
   const previousRaw=props.getProperty(JOURNAL),previous=previousRaw?JSON.parse(previousRaw):null;
   if(previous&&['PREPARED','APPLYING','RECOVERY_REQUIRED'].includes(previous.status))invalid('REFERENCE_SEED_RECOVERY_REQUIRED');
   state={seedVersion:REFERENCE_SEED_V1.seedVersion,checksum,status:'APPLYING',startedAt:clock()};setJournal(state);
   const rows=REFERENCE_SEED_V1.rows;
   for(let i=0;i<rows.length;i+=COMMIT_CHUNK)
    write(rows.slice(i,i+COMMIT_CHUNK).map(row=>({op:'insert',table:TABLE,data:Object.fromEntries(FIELDS.map(f=>[f,String(row[f])]))})));
   const verified=inspect();
   if(verified.status!=='ALREADY_APPLIED')invalid('REFERENCE_SEED_VERIFICATION_FAILED');
   state.status='APPLIED';state.completedAt=clock();setJournal(state);
   return Object.freeze({...result({status:'APPLIED',addCount:rows.length,existingCount:rows.length}),dataModified:true});
  }catch(error){
   if(state){state.status='RECOVERY_REQUIRED';state.error=String(error&&error.message||'UNKNOWN').slice(0,200);try{setJournal(state);}catch(_){}}
   throw error;
  }finally{
   props.deleteProperty(APPROVAL);
  }
 }
 function recover(){
  if(props.getProperty(RECOVERY_APPROVAL)!=='true')invalid('REFERENCE_SEED_RECOVERY_APPROVAL_REQUIRED');
  try{
   const raw=props.getProperty(JOURNAL),journal=raw?JSON.parse(raw):null;
   if(!journal||!['PREPARED','APPLYING','RECOVERY_REQUIRED'].includes(journal.status))invalid('REFERENCE_SEED_RECOVERY_NOT_REQUIRED');
   const existing=store.list(TABLE);
   if(existing.some(row=>!SEED_REFERENCE_ID.test(String(row.reference_id))||String(row.updated_by)!=='REFERENCE_SEED_V1'))invalid('REFERENCE_SEED_RECOVERY_CONFLICT');
   for(let i=0;i<existing.length;i+=COMMIT_CHUNK)
    write(existing.slice(i,i+COMMIT_CHUNK).map(row=>({op:'remove',table:TABLE,key:{reference_id:row.reference_id}})));
   setJournal({seedVersion:REFERENCE_SEED_V1.seedVersion,checksum,status:'RECOVERED',previousStatus:journal.status,recoveredAt:clock()});
   return Object.freeze({status:'RECOVERED',seedVersion:REFERENCE_SEED_V1.seedVersion,clearedCount:existing.length,dataModified:existing.length>0});
  }finally{
   props.deleteProperty(RECOVERY_APPROVAL);
  }
 }
 return Object.freeze({preview,apply,recover,checksum});
}
