import {paginate} from '../pagination/Pagination.js';
import {listFilter} from '../pagination/ListFilter.js';
import {getCampaignFlow,campaignValidateFlow} from '../flows/RegistrationFlows.js';
import {runFlowSync} from '../flows/FlowRunner.js';
export function createAdministrationOperations({store,security}) {
 const flowDeps=Object.freeze({now:()=>security.now(),id:()=>security.secretToken(),sha256:x=>security.sha256(x)});
 const required=(v,name,max=200)=>{if(typeof v!=='string'||!v.trim()||v.length>max||/^[=+@]/.test(v.trim()))throw new Error('INVALID_'+name);return v.trim();};
 const audit=(actor,action,id)=>store.insert('vc_change_audit',{
  audit_id:security.secretToken(),actor_id:actor.userId,entity_type:'administration',
  entity_id:id,action,redacted_summary:action,correlation_id:security.secretToken().slice(0,16),created_at:security.now()
 });
 function listOrgs(p){
  // D2: status / type / q filters before pagination; parentName for display.
  const f=listFilter(p,{status:['ACTIVE','DISABLED'],extra:{type:['POLICE','EXTERNAL']}});
  const rows=store.list('vc_organizations');
  const names=new Map(rows.map(o=>[String(o.organization_id),o.name]));
  const items=rows.map(o=>({...o,parentName:o.parent_id?names.get(String(o.parent_id))||'':''}))
   .filter(o=>(!f.status||o.status===f.status)&&(!f.type||o.org_type===f.type)&&f.text(o.name,o.parentName));
  return paginate(items,p,{defaultLimit:100,maxLegacyLimit:500});
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
   if(p.parentId){if(!store.one('vc_organizations',{organization_id:p.parentId}))throw new Error('PARENT_NOT_FOUND');const byId=new Map(store.list('vc_organizations').map(o=>[o.organization_id,o]));const seen=new Set();let cursor=p.parentId;while(cursor&&!seen.has(cursor)){if(cursor===id)throw new Error('INVALID_ORG_PARENT');seen.add(cursor);cursor=byId.get(cursor)?.parent_id||'';}}
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
 // VC-ADR-036: a disabled organization can be enabled again (DISABLED -> ACTIVE), audited.
 function enableOrg(p,a){
  const id=required(p.organizationId,'ORG_ID');
  const org=store.one('vc_organizations',{organization_id:id});
  if(!org)throw new Error('NOT_FOUND');
  if(org.status!=='DISABLED')throw new Error('INVALID_REQUEST_STATE');
  store.sequence(()=>{store.update('vc_organizations',{organization_id:id},{status:'ACTIVE',updated_at:security.now()});audit(a,'ORG_ENABLED',id)});
  return {organizationId:id,enabled:true};
 }
 // the campaign check is the shared flow (application/flows/RegistrationFlows.js, phase 3 wave 2a)
 function getCampaign(token,{requireCapacity=true}={}){return runFlowSync(getCampaignFlow(token,{requireCapacity},flowDeps),{store});}
 function createCampaign(p,a){
  const start=Date.parse(p.startsAt),end=Date.parse(p.endsAt),now=Date.parse(security.now()),max=p.maxSubmissions;
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end||end<=now
   ||!Number.isSafeInteger(max)||max<1||max>100000)throw new Error('INVALID_CAMPAIGN');
  // VC-ADR-031: a name helps admins tell campaigns apart; the code is stored so it can be copied at any time.
  const name=p.name===undefined?'':String(p.name).trim();
  if(name.length>120)throw new Error('INVALID_CAMPAIGN');
  const id=security.secretToken(),token=security.secretToken();
  store.sequence(()=>{
   store.insert('vc_campaigns',{campaign_id:id,token_digest:security.sha256(token),
    starts_at:new Date(start).toISOString(),ends_at:new Date(end).toISOString(),
    max_submissions:max,submitted_count:0,revoked_at:'',status:'ACTIVE',created_by:a.userId,created_at:security.now(),
    campaign_name:name,campaign_token:token});
   audit(a,'CAMPAIGN_CREATED',id);
  });
  return {campaignId:id,campaignToken:token,name};
 }
 // D2: state = OPEN | UPCOMING | ENDED | REVOKED (server clock); CURRENT = OPEN + UPCOMING.
 function campaignStateOf(x,nowMs){
  if(x.status!=='ACTIVE'||x.revoked_at)return 'REVOKED';
  if(Date.parse(x.ends_at)<=nowMs)return 'ENDED';
  if(Date.parse(x.starts_at)>nowMs)return 'UPCOMING';
  return 'OPEN';
 }
 function listCampaigns(p){
  const f=listFilter(p,{extra:{state:['CURRENT','OPEN','UPCOMING','ENDED','REVOKED']}}),nowMs=Date.parse(security.now());
  const items=store.list('vc_campaigns').map(x=>({state:campaignStateOf(x,nowMs),
   campaignId:x.campaign_id,startsAt:x.starts_at,endsAt:x.ends_at,maxSubmissions:Number(x.max_submissions),
   submittedCount:Number(x.submitted_count),status:x.status,name:x.campaign_name||'',
   campaignToken:x.campaign_token||'',createdAt:x.created_at||'',revokedAt:x.revoked_at||''
  })).filter(x=>(!f.state||(f.state==='CURRENT'?['OPEN','UPCOMING'].includes(x.state):x.state===f.state))&&f.text(x.name)).reverse(); // R6 (E2E P3): newest first — a new campaign was landing on the last page.
  return paginate(items,p,{defaultLimit:50,maxLegacyLimit:100});
 }
 const validateCampaign=p=>runFlowSync(campaignValidateFlow(p,flowDeps),{store}); // incl. the active person types
 function revokeCampaign(p,a){
  const id=required(p.campaignId,'CAMPAIGN_ID');
  store.withLock(()=>{store.update('vc_campaigns',{campaign_id:id},{status:'REVOKED',revoked_at:security.now()});audit(a,'CAMPAIGN_REVOKED',id)});
  return {campaignId:id,revoked:true};
 }
 return Object.freeze({
 // system.config.get/update: application/settings/SettingsRegistry.js (built in OperationController)

 'organizations.list':listOrgs,'organizations.create':createOrg,'organizations.update':updateOrg,'organizations.disable':disableOrg,'organizations.enable':enableOrg,
 'campaigns.create':createCampaign,'campaigns.list':listCampaigns,'campaigns.validate':validateCampaign,'campaigns.revoke':revokeCampaign,
 getCampaign
 });
}
