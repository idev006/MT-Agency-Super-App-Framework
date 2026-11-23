import {createGasSecurity} from '../security/GasSecurity.js';
// Explicitly staged first-admin provisioning. Invocation MUST originate from GAS Editor.
// S1 (VC-ADR-029): writes to the runtime store (Firestore) instead of the retired Sheets DB.
// Semantics unchanged: one-shot (refuses when any user exists), temp password consumed,
// password change forced at first login, SYSTEM_ADMIN only.
export function bootstrapStagingAdmin({store,utilities,propertiesService}) {
 if(!store)throw new Error('STORAGE_NOT_CONFIGURED');
 const props=propertiesService.getScriptProperties();
 if(props.getProperty('VEHICLE_BOOTSTRAP_STAGING_APPROVED')!=='true')
  throw new Error('STAGING_BOOTSTRAP_NOT_APPROVED');
 const username=props.getProperty('VEHICLE_BOOTSTRAP_USERNAME');
 const password=props.getProperty('VEHICLE_BOOTSTRAP_TEMP_PASSWORD');
 const idle=Number(props.getProperty('VEHICLE_BOOTSTRAP_IDLE_MINUTES'));
 if(!username||!/^[a-z0-9._-]{3,80}$/.test(username)||!Number.isSafeInteger(idle)||idle<1||idle>480)
  throw new Error('INVALID_BOOTSTRAP_CONFIGURATION');
 if(store.list('vc_users',{},2).length)throw new Error('BOOTSTRAP_ALREADY_COMPLETED');
 const security=createGasSecurity({utilities,propertiesService,clock:()=>new Date().toISOString()});
 const hashed=security.hashPassword(password);
 const userId=security.secretToken(),at=security.now();
 const writes=[
  {op:'insert',table:'vc_users',data:{user_id:userId,username_normalized:username,display_name:'Initial System Admin',
   password_hash:hashed,password_salt:'',password_change_required:true,status:'ACTIVE',org_id:'',created_at:at,updated_at:at}},
  {op:'insert',table:'vc_user_roles',data:{assignment_id:security.secretToken(),user_id:userId,role_id:'SYSTEM_ADMIN',status:'ACTIVE'}}
 ];
 if(!store.one('vc_settings',{key:'idle_timeout_minutes'}))
  writes.push({op:'insert',table:'vc_settings',data:{key:'idle_timeout_minutes',value:String(idle),updated_by:userId,updated_at:at}});
 // ONE all-or-nothing commit: the admin can never exist without its role.
 if(typeof store.writeMany==='function')store.writeMany(writes);
 else for(const w of writes)store.insert(w.table,w.data);
 props.deleteProperty('VEHICLE_BOOTSTRAP_TEMP_PASSWORD');
 props.deleteProperty('VEHICLE_BOOTSTRAP_STAGING_APPROVED');
 return {userId,created:true,passwordChangeRequired:true};
}
