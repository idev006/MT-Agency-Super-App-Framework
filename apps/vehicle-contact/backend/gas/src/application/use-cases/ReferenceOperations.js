const CATALOGS=Object.freeze({
 PROVINCE:'provinces',PLATE_TYPE:'plateTypes',VEHICLE_TYPE:'vehicleTypes',RELATIONSHIP:'relationships',
 BRAND:'brands',MODEL:'models',COLOR:'colors'
});
const STRICT=Object.freeze({province:'PROVINCE',plateType:'PLATE_TYPE',vehicleType:'VEHICLE_TYPE',relationship:'RELATIONSHIP'});
const MAX_ROWS=5000;
const clean=(value,max=120)=>{
 const out=typeof value==='string'?value.trim():'';
 if(!out||out.length>max||/^[=+@-]/.test(out))throw new Error('REFERENCE_DATA_INVALID');
 return out;
};
function loadRows(store){
 try{return store.list('vc_reference_values');}
 catch(error){if(String(error?.message||'').startsWith('MISSING_TABLE'))return null;throw error;}
}
function normalize(store,security){
 const raw=loadRows(store);
 const empty=Object.fromEntries(Object.values(CATALOGS).map(key=>[key,[]]));
 if(raw===null)return {mode:'LEGACY',version:security.sha256('P6VC_REFERENCE_LEGACY'),lists:empty,organizations:[],policies:{}};
 if(!Array.isArray(raw)||raw.length>MAX_ROWS)throw new Error('REFERENCE_DATA_BOUNDS');
 const seenIds=new Set(),seenCodes=new Set(),rows=[];
 for(const row of raw){
  const referenceId=clean(row.reference_id,100),catalog=clean(row.catalog,32).toUpperCase();
  if(!CATALOGS[catalog]||seenIds.has(referenceId))throw new Error('REFERENCE_DATA_INVALID');
  const code=clean(row.code,64).toUpperCase(),key=catalog+'|'+code,label=clean(row.label_th,120);
  if(!/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(code)||seenCodes.has(key)||!['ACTIVE','INACTIVE'].includes(row.status))
   throw new Error('REFERENCE_DATA_INVALID');
  const sortOrder=row.sort_order===''||row.sort_order===undefined?0:Number(row.sort_order);
  if(!Number.isSafeInteger(sortOrder)||sortOrder<0||sortOrder>1000000)throw new Error('REFERENCE_DATA_INVALID');
  const parentCode=row.parent_code===undefined||String(row.parent_code).trim()===''?'':clean(row.parent_code,64).toUpperCase();
  if((catalog==='MODEL')===!parentCode)throw new Error('REFERENCE_DATA_INVALID');
  seenIds.add(referenceId);seenCodes.add(key);rows.push({catalog,code,label,parentCode,sortOrder,status:row.status});
 }
 const active=rows.filter(row=>row.status==='ACTIVE');
 const brands=new Set(active.filter(row=>row.catalog==='BRAND').map(row=>row.code));
 if(active.some(row=>row.catalog==='MODEL'&&!brands.has(row.parentCode)))throw new Error('REFERENCE_DATA_INVALID');
 active.sort((a,b)=>a.sortOrder-b.sortOrder||a.label.localeCompare(b.label,'th')||a.code.localeCompare(b.code));
 const lists={...empty};
 for(const row of active)lists[CATALOGS[row.catalog]].push(Object.freeze({code:row.code,label:row.label,...(row.parentCode?{parentCode:row.parentCode}:{})}));
 let organizations=[];
 try{organizations=store.list('vc_organizations').filter(row=>row.status==='ACTIVE').map(row=>({
  code:clean(row.organization_id,100),label:clean(row.name,120)
 })).sort((a,b)=>a.label.localeCompare(b.label,'th')||a.code.localeCompare(b.code));}
 catch(error){if(!String(error?.message||'').startsWith('MISSING_TABLE'))throw error;}
 const organizationCodes=new Set();
 if(organizations.some(row=>organizationCodes.has(row.code)||!organizationCodes.add(row.code)))throw new Error('REFERENCE_DATA_INVALID');
 const complete=organizations.length>0&&Object.values(STRICT).every(catalog=>lists[CATALOGS[catalog]].length>0);
 let enforcement='ADVISORY';
 try{enforcement=String(store.one('vc_settings',{key:'registration_reference_enforcement'})?.value||'ADVISORY').toUpperCase();}
 catch(error){if(!String(error?.message||'').startsWith('MISSING_TABLE'))throw error;}
 const mode=complete&&enforcement==='ENFORCED'?'ENFORCED':complete?'ADVISORY':'LEGACY';
 const policies=Object.fromEntries(Object.entries(CATALOGS).map(([catalog,key])=>[key,
  Object.values(STRICT).includes(catalog)&&mode==='ENFORCED'?'ENFORCED':'ADVISORY']));
 policies.organizations=mode==='ENFORCED'?'ENFORCED':'ADVISORY';
 const canonical=JSON.stringify({lists,organizations,policies});
 return {mode,version:security.sha256(canonical),lists,organizations,policies};
}
export function createReferenceOperations({store,security}){
 const get=()=>normalize(store,security);
 function assertRegistration(payload){
  const result=get(),supplied=payload.referenceVersion;
  if(result.mode==='LEGACY')return result;
  if(result.mode==='ADVISORY'&&!supplied)return result;
  if(typeof supplied!=='string'||supplied!==result.version)throw new Error('REFERENCE_VERSION_STALE');
  for(const [field,catalog] of Object.entries(STRICT)){
   const code=typeof payload[field]==='string'?payload[field].trim().toUpperCase():'';
   if(!result.lists[CATALOGS[catalog]].some(row=>row.code===code))throw new Error('INVALID_REFERENCE_VALUE');
  }
  if(!result.organizations.some(row=>row.code===String(payload.organizationId||'').trim()))throw new Error('ORGANIZATION_INACTIVE');
  return result;
 }
 return Object.freeze({'references.registration':get,assertRegistration});
}
