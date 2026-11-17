// Administrative business operations; invoke ONLY after server-side authentication.
// This module deliberately does not expose public GAS entrypoints.
const SPEC=Object.freeze({
 'system.config.get':{table:'vc_settings',mode:'get',permission:'system.config.read'},
 'system.config.update':{table:'vc_settings',mode:'update',permission:'system.config.write',key:'key',fields:['value']},
 'users.create':{table:'vc_users',mode:'create',permission:'users.manage',key:'user_id',fields:['username','display_name','organization_id','status']},
 'users.list':{table:'vc_users',mode:'list',permission:'users.read'},
 'users.update':{table:'vc_users',mode:'update',permission:'users.manage',key:'user_id',fields:['display_name','organization_id']},
 'users.suspend':{table:'vc_users',mode:'status',permission:'users.manage',key:'user_id',status:'SUSPENDED'},
 'organizations.list':{table:'vc_organizations',mode:'list',permission:'organizations.read'},
 'organizations.create':{table:'vc_organizations',mode:'create',permission:'organizations.manage',key:'organization_id',fields:['name','parent_id','status']},
 'organizations.update':{table:'vc_organizations',mode:'update',permission:'organizations.manage',key:'organization_id',fields:['name','parent_id']},
 'organizations.disable':{table:'vc_organizations',mode:'status',permission:'organizations.manage',key:'organization_id',status:'DISABLED'},
 'campaigns.list':{table:'vc_campaigns',mode:'list',permission:'campaigns.read'},
 'campaigns.revoke':{table:'vc_campaigns',mode:'status',permission:'campaigns.manage',key:'campaign_id',status:'REVOKED'}
});
export const ADMIN_OPERATIONS=Object.freeze(Object.keys(SPEC));
export function createAdminOperations({spreadsheetApp,spreadsheetId,lockService,uuid,clock,writeEnabled=false}) {
 if(!spreadsheetApp||typeof spreadsheetApp.openById!=='function'||!spreadsheetId||!lockService||typeof uuid!=='function'||typeof clock!=='function')
  throw new Error('ADMIN_ADAPTER_NOT_CONFIGURED');
 function table(name) {
  const sheet=spreadsheetApp.openById(spreadsheetId).getSheetByName(name);
  if(!sheet)throw new Error('SCHEMA_MISMATCH');
  const values=sheet.getDataRange().getValues();
  if(!values.length)throw new Error('SCHEMA_MISMATCH');
  const headers=values[0].map(String);
  if(headers.some(h=>!h)||new Set(headers).size!==headers.length)throw new Error('SCHEMA_MISMATCH');
  return {sheet,headers,rows:values.slice(1).map((cells,i)=>({row:i+2,data:Object.fromEntries(headers.map((h,j)=>[h,cells[j]]))}))
   .filter(x=>Object.values(x.data).some(v=>v!==''&&v!==null))};
 }
 function requirePermission(context,permission) {
  if(!context||context.trustedBoundary!==true||!context.principal||!context.principal.userId||
   !Array.isArray(context.principal.permissions)||!context.principal.permissions.includes(permission))
   throw new Error('FORBIDDEN');
 }
 function safeValue(v) {
  if(typeof v!=='string'||!v.trim()||v.length>256||/^[=+@\-]/.test(v.trim()))throw new Error('INVALID_FIELD');
  return v.trim();
 }
 function withLock(work) {
  const lock=lockService.getScriptLock();
  if(!lock.tryLock(10000))throw new Error('BUSY');
  try{return work();}finally{lock.releaseLock();}
 }
 function apply(operation,payload={},context) {
  const spec=SPEC[operation];
  if(!spec)throw new Error('UNKNOWN_OPERATION');
  requirePermission(context,spec.permission);
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('INVALID_PAYLOAD');
  if(spec.mode==='get'||spec.mode==='list'){
   const t=table(spec.table);
   if(spec.mode==='get')return t.rows.map(x=>x.data).filter(x=>!String(x.key).startsWith('SECRET_'));
   const limit=payload.limit===undefined?50:payload.limit;
   if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('INVALID_LIMIT');
   return t.rows.slice(0,limit).map(x=>{
    const data={...x.data};
    for(const key of Object.keys(data))if(/password|token|secret|digest|salt/i.test(key))delete data[key];
    return data;
   });
  }
  // Schema and privacy gates must be approved before any sensitive writes.
  if(writeEnabled!==true)throw new Error('SCHEMA_APPROVAL_REQUIRED');
  return withLock(()=>{
   const t=table(spec.table);
   if(!t.headers.includes(spec.key))throw new Error('SCHEMA_MISMATCH');
   const id=spec.mode==='create'?uuid():safeValue(payload[spec.key]);
   const existing=t.rows.filter(x=>String(x.data[spec.key])===id);
   if(existing.length>1)throw new Error('DUPLICATE_KEY');
   if(spec.mode==='create'&&existing.length)throw new Error('DUPLICATE_KEY');
   if(spec.mode!=='create'&&!existing.length)throw new Error('NOT_FOUND');
   if(spec.mode==='create'){
    const data={[spec.key]:id};
    for(const f of spec.fields)data[f]=payload[f]===undefined?'':safeValue(payload[f]);
    if(t.headers.includes('created_at'))data.created_at=clock();
    if(t.headers.includes('created_by'))data.created_by=context.principal.userId;
    t.sheet.appendRow(t.headers.map(h=>data[h]===undefined?'':data[h]));
    return {[spec.key]:id};
   }
   const current=existing[0];
   const patch=spec.mode==='status'?{status:spec.status}:Object.fromEntries(spec.fields
    .filter(f=>Object.prototype.hasOwnProperty.call(payload,f)).map(f=>[f,safeValue(payload[f])]));
   if(!Object.keys(patch).length)throw new Error('NO_CHANGES');
   if(Object.keys(patch).some(f=>!t.headers.includes(f)))throw new Error('SCHEMA_MISMATCH');
   if(t.headers.includes('updated_at'))patch.updated_at=clock();
   if(t.headers.includes('updated_by'))patch.updated_by=context.principal.userId;
   const values=t.headers.map(h=>patch[h]===undefined?current.data[h]:patch[h]);
   t.sheet.getRange(current.row,1,1,values.length).setValues([values]);
   return {[spec.key]:id,updated:true};
  });
 }
 return Object.freeze({execute:apply,operations:ADMIN_OPERATIONS});
}
