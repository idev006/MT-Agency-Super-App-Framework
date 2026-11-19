import {paginate} from '../pagination/Pagination.js';
export function createAdministrationOperations({store,security}) {
 const required=(v,name,max=200)=>{if(typeof v!=='string'||!v.trim()||v.length>max||/^[=+@]/.test(v.trim()))throw new Error('INVALID_'+name);return v.trim();};
 const audit=(actor,action,id)=>store.insert('vc_change_audit',{
  audit_id:security.secretToken(),actor_id:actor.userId,entity_type:'administration',
  entity_id:id,action,redacted_summary:action,correlation_id:security.secretToken().slice(0,16),created_at:security.now()
 });
 const settings=['idle_timeout_minutes','retention_days'];
 function getSettings(){
  return Object.fromEntries(settings.map(k=>[k,store.one('vc_settings',{key:k})?.value??null]));
 }
 function updateSettings(p,a){
  const values=p.values;
  if(!values||typeof values!=='object'||Array.isArray(values)||!Object.keys(values).length
   ||Object.keys(values).some(k=>!settings.includes(k)))throw new Error('INVALID_SETTINGS');
  store.sequence(()=>{
   for(const [key,value] of Object.entries(values)){
    if(!Number.isSafeInteger(value)||value<1||value>(key==='idle_timeout_minutes'?480:3650))throw new Error('INVALID_SETTING_VALUE');
    const row={value:String(value),updated_by:a.userId,updated_at:security.now()};
    if(store.one('vc_settings',{key}))store.update('vc_settings',{key},row);
    else store.insert('vc_settings',{key,...row});
   }
   audit(a,'SETTINGS_UPDATED','GLOBAL');
  });
  return getSettings();
 }
 function listOrgs(p){
  return paginate(store.list('vc_organizations'),p,{defaultLimit:100,maxLegacyLimit:500});
 }
 function createOrg(p,a){
  const id=security.secretToken(),type=required(p.type,'ORG_TYPE');
  if(!['POLICE','EXTERNAL'].includes(type))throw new Error('INVALID_ORG_TYPE');
  if(type==='POLICE'&&p.parentId&&!store.one('vc_organizations',{organization_id:p.parentId}))throw new Error('PARENT_NOT_FOUND');
  store.sequence(()=>{
   store.insert('vc_organizations',{organization_id:id,name:required(p.name,'ORG_NAME'),org_type:type,
    parent_id:type==='POLICE'?(p.parentId||''):'',status:'ACTIVE',created_at:security.now(),updated_at:security.now()});
   audit(a,'ORG_CREATED',id);
  });
  return {organizationId:id};
 }
 function updateOrg(p,a){
  const id=required(p.organizationId,'ORG_ID'),patch={updated_at:security.now()};
  if(p.name!==undefined)patch.name=required(p.name,'ORG_NAME');
  if(p.parentId!==undefined){
   if(p.parentId===id)throw new Error('INVALID_ORG_PARENT');
   if(p.parentId&&!store.one('vc_organizations',{organization_id:p.parentId}))throw new Error('PARENT_NOT_FOUND');
   patch.parent_id=p.parentId;
  }
  store.sequence(()=>{store.update('vc_organizations',{organization_id:id},patch);audit(a,'ORG_UPDATED',id)});
  return {organizationId:id,updated:true};
 }
 function disableOrg(p,a){
  const id=required(p.organizationId,'ORG_ID');
  store.sequence(()=>{store.update('vc_organizations',{organization_id:id},{status:'DISABLED',updated_at:security.now()});audit(a,'ORG_DISABLED',id)});
  return {organizationId:id,disabled:true};
 }
 function getCampaign(token,{requireCapacity=true}={}){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/i.test(token))throw new Error('CAMPAIGN_INVALID');
  const row=store.one('vc_campaigns',{token_digest:security.sha256(token.toLowerCase())});
  const now=Date.parse(security.now());
  if(!row||row.status!=='ACTIVE'||row.revoked_at||Date.parse(row.starts_at)>now||Date.parse(row.ends_at)<=now
   ||requireCapacity&&Number(row.submitted_count)>=Number(row.max_submissions))throw new Error('CAMPAIGN_INVALID');
  return row;
 }
 function createCampaign(p,a){
  const start=Date.parse(p.startsAt),end=Date.parse(p.endsAt),now=Date.parse(security.now()),max=p.maxSubmissions;
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end||end<=now
   ||!Number.isSafeInteger(max)||max<1||max>100000)throw new Error('INVALID_CAMPAIGN');
  const id=security.secretToken(),token=security.secretToken();
  store.sequence(()=>{
   store.insert('vc_campaigns',{campaign_id:id,token_digest:security.sha256(token),
    starts_at:new Date(start).toISOString(),ends_at:new Date(end).toISOString(),
    max_submissions:max,submitted_count:0,revoked_at:'',status:'ACTIVE',created_by:a.userId,created_at:security.now()});
   audit(a,'CAMPAIGN_CREATED',id);
  });
  return {campaignId:id,campaignToken:token};
 }
 function listCampaigns(p){
  const items=store.list('vc_campaigns').map(x=>({
   campaignId:x.campaign_id,startsAt:x.starts_at,endsAt:x.ends_at,maxSubmissions:Number(x.max_submissions),
   submittedCount:Number(x.submitted_count),status:x.status
  }));
  return paginate(items,p,{defaultLimit:50,maxLegacyLimit:100});
 }
 function validateCampaign(p){
  const row=getCampaign(p.campaignToken);
  return {valid:true,campaignId:row.campaign_id};
 }
 function revokeCampaign(p,a){
  const id=required(p.campaignId,'CAMPAIGN_ID');
  store.withLock(()=>{store.update('vc_campaigns',{campaign_id:id},{status:'REVOKED',revoked_at:security.now()});audit(a,'CAMPAIGN_REVOKED',id)});
  return {campaignId:id,revoked:true};
 }
 return Object.freeze({
 'system.config.get':getSettings,'system.config.update':updateSettings,
 'organizations.list':listOrgs,'organizations.create':createOrg,'organizations.update':updateOrg,'organizations.disable':disableOrg,
 'campaigns.create':createCampaign,'campaigns.list':listCampaigns,'campaigns.validate':validateCampaign,'campaigns.revoke':revokeCampaign,
 getCampaign
 });
}
