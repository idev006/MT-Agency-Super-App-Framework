import {createSheetStore} from '../persistence/sheets/SheetStore.js';
import {createGasSecurity} from '../security/GasSecurity.js';
// Explicitly staged first-admin provisioning. Invocation MUST originate from GAS Editor.
export function bootstrapStagingAdmin({spreadsheetApp,lockService,utilities,propertiesService}) {
 const props=propertiesService.getScriptProperties();
 if(props.getProperty('VEHICLE_BOOTSTRAP_STAGING_APPROVED')!=='true')
  throw new Error('STAGING_BOOTSTRAP_NOT_APPROVED');
 const spreadsheetId=props.getProperty('VEHICLE_SHEET_ID'),username=props.getProperty('VEHICLE_BOOTSTRAP_USERNAME');
 const password=props.getProperty('VEHICLE_BOOTSTRAP_TEMP_PASSWORD');
 const idle=Number(props.getProperty('VEHICLE_BOOTSTRAP_IDLE_MINUTES'));
 if(!username||!/^[a-z0-9._-]{3,80}$/.test(username)||!Number.isSafeInteger(idle)||idle<1||idle>480)
  throw new Error('INVALID_BOOTSTRAP_CONFIGURATION');
 const store=createSheetStore({spreadsheetApp,spreadsheetId,lockService});
 if(store.list('vc_users',{},2).length)throw new Error('BOOTSTRAP_ALREADY_COMPLETED');
 const security=createGasSecurity({utilities,propertiesService,clock:()=>new Date().toISOString()});
 const hashed=security.hashPassword(password);
 const userId=security.secretToken();
 store.atomic(()=>{
  if(store.list('vc_users',{},2).length)throw new Error('BOOTSTRAP_ALREADY_COMPLETED');
  store.insert('vc_users',{user_id:userId,username_normalized:username,display_name:'Initial System Admin',
   password_hash:hashed,password_salt:'',password_change_required:true,status:'ACTIVE',org_id:'',
   created_at:security.now(),updated_at:security.now()});
  store.insert('vc_user_roles',{assignment_id:security.secretToken(),user_id:userId,role_id:'SYSTEM_ADMIN',status:'ACTIVE'});
  if(!store.one('vc_settings',{key:'idle_timeout_minutes'}))
   store.insert('vc_settings',{key:'idle_timeout_minutes',value:String(idle),updated_by:userId,updated_at:security.now()});
 });
 props.deleteProperty('VEHICLE_BOOTSTRAP_TEMP_PASSWORD');
 props.deleteProperty('VEHICLE_BOOTSTRAP_STAGING_APPROVED');
 return {userId,created:true,passwordChangeRequired:true};
}
