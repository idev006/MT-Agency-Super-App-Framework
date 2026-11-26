/* P6VC API Test Console — minimal Cloudflare Worker.
 * The public GitHub source contains NO GAS password, tokens or access keys.
 * Secrets required: BRIDGE_ACCESS_KEY, TEST_LOGIN_PASSWORD
 * Text vars: P6VC_GAS_EXEC_URL, TEST_LOGIN_USERNAME
 * Restriction: allowlisted read-only tests only; never accepts arbitrary URL/action.
 */
const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer","x-frame-options":"DENY"};
// SIVP section 10: exact-match allowlist. MUST equal apps/vehicle-contact/contracts/trusted-endpoints.v1.json
// (drift test WORKER-SIVP01). P6VC_API_URL set -> Cloud Run API (VC-ADR-035); unset -> GAS (rollback).
// Any other value fails closed (GATEWAY_NOT_CONFIGURED); nothing is forwarded.
const TRUSTED_GAS_URL="https://script.google.com/macros/s/AKfycby15c-Aux2za0BuedeIYni8-tc6rkf9ZVNmw-6ZMTgPvG9SvFjuQVSzNoMouiMhqTmxrA/exec";
const TRUSTED_CLOUD_RUN_URL="https://p6vc-api-46858005337.asia-southeast3.run.app";
export const TRUSTED_UPSTREAMS=Object.freeze([TRUSTED_GAS_URL,TRUSTED_CLOUD_RUN_URL]);
function upstream(env){
 if(env.P6VC_API_URL!==undefined&&env.P6VC_API_URL!=="")return env.P6VC_API_URL===TRUSTED_CLOUD_RUN_URL?env.P6VC_API_URL:"";
 return env.P6VC_GAS_EXEC_URL===TRUSTED_GAS_URL?env.P6VC_GAS_EXEC_URL:"";
}
const READ_ONLY_OPERATIONS=new Set(["system.health","system.config.get","users.list","organizations.list","campaigns.list","registrations.listPending","vehicles.lookup","vehicles.history","changes.listPending","retention.jobStatus","qr.history"]);
const FRONTEND_PAYLOAD_FIELDS=Object.freeze({
 "system.health":[[],[]],
 "auth.login":[["username","password"],[]],
 "auth.session":[[],[]],"auth.logout":[[],[]],
 "auth.changePassword":[["oldPassword","newPassword"],[]],
 "auth.linkGoogle":[["password","idToken"],[]],
 "users.create":[["username","displayName","temporaryPassword"],["organizationId"]],
 "users.list":[[],["limit","page","pageSize","status","role","q"]],"users.update":[["userId"],["displayName","organizationId"]],
 "users.suspend":[["userId"],[]],"users.reactivate":[["userId"],[]],"users.resetPassword":[["userId","temporaryPassword"],[]],
 "users.assignRoles":[["userId","roles"],[]],
 "organizations.list":[[],["limit","page","pageSize","status","type","q"]],"organizations.create":[["name","type"],["parentId"]],
 "organizations.update":[["organizationId"],["name","parentId"]],"organizations.disable":[["organizationId"],[]],"organizations.enable":[["organizationId"],[]],
 "campaigns.create":[["startsAt","endsAt","maxSubmissions"],["name"]],"campaigns.list":[[],["limit","page","pageSize","state","q"]],
 "campaigns.validate":[["campaignToken"],[]],
 "campaigns.revoke":[["campaignId"],[]],
 "references.registration":[[],[]],
 "photos.upload":[["campaignToken","slot","base64Image","mimeType"],[]],
 "photos.list":[["vehicleId"],[]],"photos.replace":[["vehicleId","slot","base64Image","mimeType"],[]],
 "registrations.submit":[["campaignToken","plate","province","plateType","vehicleType","brand","model","color","organizationId","relationship","contactName","contactPhone","photos","idempotencyKey"],["referenceVersion","stickerCategory"]],
 "registrations.listPending":[[],["limit","page","pageSize"]],
 "registrations.detail":[["requestId"],[]],
 "registrations.review":[["requestId","decision"],["platePhotoVerified","stickerCategory"]],
 "registrations.photo":[["requestId","photoId"],[]],"vehicles.photo":[["vehicleId","photoId"],[]],
 "vehicles.lookup":[["plate","province"],[]],
 "vehicles.detail":[["vehicleId"],[]],
 "vehicles.update":[["vehicleId","expectedVersion"],["plate","province","plateType","vehicleType","brand","model","color","ownerUserId","stickerCategory"]],
 "vehicles.cancel":[["vehicleId"],[]],
 "vehicles.history":[["vehicleId"],[]],
 "vehicles.listMine":[[],["limit","page","pageSize"]],
 "vehicles.list":[[],["limit","page","pageSize"]],
 "contacts.read":[["vehicleId"],[]],"contacts.update":[["vehicleId"],["contactName","contactPhone"]],
 "changes.submit":[["vehicleId"],["contactName","contactPhone","brand","model","color"]],
 "changes.listPending":[[],["limit","page","pageSize"]],"changes.review":[["requestId","decision"],[]],
 "changes.listMine":[[],["limit","page","pageSize"]],
 "qr.resolve":[["token"],[]],
 "qr.issue":[["vehicleId","reason"],["note"]],"qr.revoke":[["vehicleId","reason"],["note"]],"qr.replace":[["vehicleId","reason"],["note"]],"qr.history":[["vehicleId"],[]],"qr.export":[["vehicleIds"],[]],
 "system.config.get":[[],[]],"system.config.update":[["values"],[]],"system.reset.preview":[[],["keepUsers","keepCampaigns"]],"system.reset.execute":[["confirmation","password","planDigest"],["keepUsers","keepCampaigns"]],
 "retention.listDue":[[],["limit","page","pageSize"]],"retention.listExecutable":[[],["limit","page","pageSize"]],"retention.approve":[["jobId"],[]],"retention.execute":[["jobId"],[]],"retention.jobStatus":[["jobId"],[]],
 "audit.query":[[],["vehicleId","limit","page","pageSize"]],"audit.export":[[],["vehicleId","limit"]]
});
const FRONTEND_OPERATIONS=new Set(Object.keys(FRONTEND_PAYLOAD_FIELDS));
const FRONTEND_PUBLIC_OPERATIONS=new Set(["system.health","auth.login","campaigns.validate","photos.upload","registrations.submit"]);
const JOB_ID=/^job_[0-9a-f]{32}$/;
const IDEMPOTENCY_KEY=/^[A-Za-z0-9._:-]{8,128}$/;
const JOB_TTL_SECONDS=7*24*60*60;
const reply=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:JSON_HEADERS});
function allowedFrontendOrigin(request,env){
 const origin=request.headers.get("origin")||"";
 if(/^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(origin))return origin;
 const configured=String(env.FRONTEND_ALLOWED_ORIGINS||"https://idev006.github.io")
  .split(",").map(x=>x.trim()).filter(Boolean);
 return configured.includes(origin)?origin:null;
}
function frontendHeaders(origin){return {...JSON_HEADERS,"access-control-allow-origin":origin,
 "access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"content-type",
 "access-control-max-age":"600","vary":"Origin"};}
const frontendReply=(origin,obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:frontendHeaders(origin)});
const code=x=>typeof x==="string"&&/^[A-Z0-9_]{1,80}$/.test(x)?x:"UNKNOWN";
const summary=(kind,rows)=>({service:"p6vc-api-test-console",kind,generatedAt:new Date().toISOString(),
 result:rows.every(x=>x.result==="PASS")?"PASS":"FAIL",passed:rows.filter(x=>x.result==="PASS").length,
 failed:rows.filter(x=>x.result==="FAIL").length,tests:rows,credentialsExposed:false,sessionTokensExposed:false});
async function sameKey(a,b){
 if(typeof a!=="string"||typeof b!=="string"||a.length<32||b.length<32)return false;
 const hashed=async s=>new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)));
 const [x,y]=await Promise.all([hashed(a),hashed(b)]);let diff=0;
 for(let i=0;i<x.length;i++)diff|=x[i]^y[i];
 return diff===0;
}
async function gas(env,group,action,payload={},token=null,method="POST",requestId=null){
 const options={method,redirect:"follow",signal:AbortSignal.timeout(40000),headers:{"accept":"application/json"}};
 if(method==="POST"){
  options.headers["content-type"]="text/plain;charset=utf-8";
  options.body=JSON.stringify({apiVersion:"v1",group,action,payload,...(token?{sessionToken:token}:{}),...(requestId?{requestId}:{})});
 }
 let r;
 try{r=await fetch(upstream(env),options);}catch{throw Error("GAS_NETWORK_ERROR");}
 if(r.status!==200)throw Error("GAS_HTTP_ERROR");
 let j;try{j=await r.json();}catch{throw Error("GAS_NON_JSON");}
 if(!j||typeof j.ok!=="boolean"||!Object.hasOwn(j,"data")||!Object.hasOwn(j,"error"))
  throw Error("GAS_BAD_ENVELOPE");
 return j;
}
function validFrontendEnvelope(input){
 if(!input||typeof input!=="object"||Array.isArray(input))return "INVALID_BODY";
 const allowedFields=new Set(["apiVersion","group","action","payload","requestId","sessionToken"]);
 if(Object.keys(input).some(key=>!allowedFields.has(key)))return "FIELDS_NOT_ALLOWED";
 if(input.apiVersion!=="v1"||typeof input.group!=="string"||typeof input.action!=="string")return "INVALID_ENVELOPE";
 const operation=input.group+"."+input.action;
 if(!FRONTEND_OPERATIONS.has(operation))return "OPERATION_NOT_ALLOWED";
 const payloadSize=JSON.stringify(input.payload||{}).length;
 if(!input.payload||typeof input.payload!=="object"||Array.isArray(input.payload)
  ||(operation==="photos.upload"||operation==="photos.replace"?payloadSize>7_500_000:payloadSize>32768))
  return "INVALID_PAYLOAD";
 if(typeof input.requestId!=="string"||!/^[A-Za-z0-9_-]{8,80}$/.test(input.requestId))return "INVALID_REQUEST_ID";
 const keys=Object.keys(input.payload);
 const [required,optional]=FRONTEND_PAYLOAD_FIELDS[operation],allowed=new Set([...required,...optional]);
 if(required.some(key=>!Object.hasOwn(input.payload,key))||keys.some(key=>!allowed.has(key)))return "INVALID_OPERATION_PAYLOAD";
 if(operation==="photos.upload"){
  const p=input.payload;
  if(!/^[0-9a-f]{64}$/i.test(p.campaignToken||"")||!["FRONT","REAR","LEFT","RIGHT","FRONT_ANGLE"].includes(p.slot)
   ||typeof p.base64Image!=="string"||p.base64Image.length<4||p.base64Image.length>7_000_000
   ||!/^[A-Za-z0-9+/]+={0,2}$/.test(p.base64Image)||!["image/jpeg","image/png","image/webp"].includes(p.mimeType))
   return "INVALID_OPERATION_PAYLOAD";
  if(input.sessionToken!==undefined)return "INVALID_PUBLIC_PAYLOAD";
  return null;
 }
 if(operation==="photos.replace"){
  const p=input.payload;
  if(typeof p.vehicleId!=="string"||!p.vehicleId.trim()||p.vehicleId.length>256
   ||!["FRONT","REAR","LEFT","RIGHT","FRONT_ANGLE"].includes(p.slot)
   ||typeof p.base64Image!=="string"||p.base64Image.length<4||p.base64Image.length>7_000_000
   ||!/^[A-Za-z0-9+/]+={0,2}$/.test(p.base64Image)||!["image/jpeg","image/png","image/webp"].includes(p.mimeType))
   return "INVALID_OPERATION_PAYLOAD";
  if(!/^[0-9a-f]{64}$/i.test(input.sessionToken||""))return "INVALID_SESSION_PAYLOAD";
  return null;
 }
 const safeValue=(value,depth=0)=>{
  if(depth>3)return false;
  if(value===null||typeof value==="boolean")return true;
  if(typeof value==="number")return Number.isFinite(value);
  if(typeof value==="string")return value.length<=4096;
  if(Array.isArray(value))return value.length<=10&&value.every(item=>safeValue(item,depth+1));
  if(typeof value==="object")return Object.entries(value).length<=10&&Object.entries(value).every(([key,item])=>
   /^[A-Za-z0-9_]{1,80}$/.test(key)&&!["__proto__","constructor","prototype"].includes(key)&&safeValue(item,depth+1));
  return false;
 };
 if(!keys.every(key=>safeValue(input.payload[key])))return "INVALID_OPERATION_PAYLOAD";
 if(operation==="auth.login"&&(typeof input.payload.username!=="string"||input.payload.username.length<1||input.payload.username.length>100||
   typeof input.payload.password!=="string"||input.payload.password.length<1||input.payload.password.length>128))return "INVALID_LOGIN_PAYLOAD";
 if(operation==="campaigns.validate"&&!/^[0-9a-f]{64}$/i.test(input.payload.campaignToken||""))return "INVALID_OPERATION_PAYLOAD";
 if(operation==="vehicles.lookup"){
  const p=input.payload;
  if(typeof p.plate!=="string"||!p.plate.trim()||p.plate.length>64
   ||typeof p.province!=="string"||!/^[A-Za-z0-9_-]{1,32}$/.test(p.province))
   return "INVALID_OPERATION_PAYLOAD";
 }
 if(operation==="vehicles.history"&&(typeof input.payload.vehicleId!=="string"
  ||!input.payload.vehicleId.trim()||input.payload.vehicleId.length>256))return "INVALID_OPERATION_PAYLOAD";
 if(operation==="qr.resolve"&&!/^[0-9a-f]{64}$/i.test(input.payload.token||""))return "INVALID_OPERATION_PAYLOAD";
 if(operation==="registrations.submit"){
  const p=input.payload;
  if(!/^[0-9a-f]{64}$/i.test(p.campaignToken||"")||!Array.isArray(p.photos)||p.photos.length!==5
   ||(p.referenceVersion!==undefined&&!/^[0-9a-f]{64}$/i.test(p.referenceVersion))
   ||p.photos.some(photo=>!photo||typeof photo!=="object"||Object.keys(photo).some(key=>!["slot","photoId"].includes(key))
    ||!["FRONT","REAR","LEFT","RIGHT","FRONT_ANGLE"].includes(photo.slot)||typeof photo.photoId!=="string"||!photo.photoId))
   return "INVALID_OPERATION_PAYLOAD";
 }
 if(FRONTEND_PUBLIC_OPERATIONS.has(operation)){
  if(input.sessionToken!==undefined)return "INVALID_PUBLIC_PAYLOAD";
 }else if(!/^[0-9a-f]{64}$/i.test(input.sessionToken||""))return "INVALID_SESSION_PAYLOAD";
 return null;
}
async function frontendGateway(request,env,origin){
 const raw=await request.text();
 if(raw.length>8*1024*1024)return frontendReply(origin,{error:"REQUEST_TOO_LARGE"},413);
 if(request.headers.get("content-type")?.split(";")[0]!=="application/json")
  return frontendReply(origin,{error:"JSON_REQUIRED"},415);
 let input;try{input=JSON.parse(raw);}catch{return frontendReply(origin,{error:"INVALID_JSON"},400);}
 if(!(input?.group==="photos"&&(input?.action==="upload"||input?.action==="replace"))&&raw.length>32768)
  return frontendReply(origin,{error:"REQUEST_TOO_LARGE"},413);
 const invalid=validFrontendEnvelope(input);
 if(invalid)return frontendReply(origin,{error:invalid},403);
 try{
  const result=await gas(env,input.group,input.action,input.payload,input.sessionToken||null,"POST",input.requestId);
  return frontendReply(origin,result);
 }catch{return frontendReply(origin,{error:"GATEWAY_UPSTREAM_ERROR"},502);}
}
async function test(rows,id,fn){
 const t=Date.now();
 try{const detail=await fn();rows.push({id,result:"PASS",ms:Date.now()-t,detail:detail||""});return true;}
 catch(e){rows.push({id,result:"FAIL",ms:Date.now()-t,error:code(e.message)});return false;}
}
function expect(j,expectedOk,errorCode){
 if(j.ok!==expectedOk)throw Error("UNEXPECTED_API_STATUS");
 if(!expectedOk&&j.error?.code!==errorCode)throw Error("UNEXPECTED_API_ERROR");
}
async function health(env){
 const rows=[];
 await test(rows,"HEALTH-01.GET",async()=>{
  const j=await gas(env,"system","health",{},null,"GET");expect(j,true);
  if(!["bootstrap","ready"].includes(j.data?.status))throw Error("HEALTH_STATUS_UNEXPECTED");
 });
 await test(rows,"HEALTH-02.POST",async()=>{expect(await gas(env,"system","health"),true);});
 return summary("health",rows);
}
async function auth(env,inputs={}){
 const manualUser=typeof inputs.username==="string"&&inputs.username.length>0;
 const manualPassword=typeof inputs.password==="string"&&inputs.password.length>0;
 if(manualUser!==manualPassword)
  return summary("auth",[{id:"CONFIG",result:"FAIL",error:"CREDENTIAL_PAIR_REQUIRED"}]);
 const testUser=manualUser?inputs.username:env.TEST_LOGIN_USERNAME;
 const testPassword=manualPassword?inputs.password:env.TEST_LOGIN_PASSWORD;
 const rows=[];let token=null;
 if(typeof testUser!=="string"||!testUser||testUser.length>100||
 typeof testPassword!=="string"||testPassword.length<12||testPassword.length>128)
 return summary("auth",[{id:"CONFIG",result:"FAIL",error:"TEST_CREDENTIALS_MISSING"}]);
 await test(rows,"LOGIN-01.HEALTH",async()=>expect(await gas(env,"system","health",{},null,"GET"),true));
 await test(rows,"LOGIN-02.INVALID_EMPTY_PAYLOAD",async()=>expect(await gas(env,"auth","login",{}),false,"INVALID_REQUEST"));
 await test(rows,"LOGIN-03.UNAUTHENTICATED_SESSION",async()=>expect(await gas(env,"auth","session"),false,"UNAUTHENTICATED"));
 const loginOk=await test(rows,"LOGIN-04.VALID_CREDENTIALS",async()=>{
  const j=await gas(env,"auth","login",{username:testUser,password:testPassword});
  if(!j.ok)throw Error("LOGIN_DENIED_"+code(j.error?.code));
  if(!/^[0-9a-f]{64}$/i.test(j.data?.sessionToken||""))throw Error("SESSION_TOKEN_INVALID");
  token=j.data.sessionToken;return "login accepted; token hidden";
 });
 try{
  if(loginOk&&token){
   await test(rows,"LOGIN-05.SESSION_AND_ROLE",async()=>{
    const j=await gas(env,"auth","session",{},token);expect(j,true);
    if(!Array.isArray(j.data?.roles)||!j.data.roles.includes("SYSTEM_ADMIN"))throw Error("SYSTEM_ADMIN_MISSING");
    return "SYSTEM_ADMIN";
   });
   await test(rows,"LOGIN-06.PASSWORD_CHANGE_POLICY",async()=>{
    const j=await gas(env,"auth","session",{},token);expect(j,true);
    if(j.data?.mustChangePassword!==true)throw Error("PASSWORD_CHANGE_POLICY_INVALID");
    return "mustChangePassword=true";
   });
  }
 }finally{
  if(token){
   const out=await test(rows,"LOGIN-07.LOGOUT",async()=>{
    const j=await gas(env,"auth","logout",{},token);expect(j,true);
    if(j.data?.revoked!==true)throw Error("LOGOUT_NOT_REVOKED");
    return "revoked=true";
   });
   if(out)await test(rows,"LOGIN-08.REVOKED_SESSION_DENIAL",async()=>{
    expect(await gas(env,"auth","session",{},token),false,"UNAUTHENTICATED");
   });
  }
 }
 return summary("auth",rows);
}

function safePayload(p){
 if(!p||typeof p!=="object"||Array.isArray(p)||JSON.stringify(p).length>4096)return false;
 let n=0;const forbidden=/password|secret|token|authorization|cookie|credential|api[_-]?key/i;
 function valid(v,depth=0){
  if(depth>5||++n>180)return false;
  if(v!==null&&typeof v==="object"){
   if(Array.isArray(v))return v.length<=60&&v.every(x=>valid(x,depth+1));
   const e=Object.entries(v);
   return e.length<=50&&e.every(([k,x])=>k.length<=80&&!forbidden.test(k)&&
    !["__proto__","constructor","prototype"].includes(k)&&valid(x,depth+1));
  }
  return v===null||typeof v==="boolean"||
   typeof v==="number"&&Number.isFinite(v)||typeof v==="string"&&v.length<=1024;
 }
 return valid(p);
}
async function apiProbe(env,req){
 const operation=typeof req.operation==="string"?req.operation:"";
 if(!READ_ONLY_OPERATIONS.has(operation))return {error:"OPERATION_NOT_ALLOWLISTED"};
 if(!safePayload(req.payload))return {error:"INVALID_PAYLOAD"};
 const method=req.method==="GET"?"GET":"POST";
 if(method==="GET"&&operation!=="system.health")return {error:"METHOD_NOT_ALLOWED"};
 const requestId=req.requestId||crypto.randomUUID();
 if(!/^[a-zA-Z0-9_-]{8,64}$/.test(requestId))return {error:"INVALID_REQUEST_ID"};
 const [group,...rest]=operation.split("."),action=rest.join(".");
 let token=null,loginError=null,backend=null,logoutAttempted=false,logoutRevoked=false;
 const authenticated=req.useTestSession===true&&operation!=="system.health";
 const started=Date.now();
 try{
  if(authenticated){
   const providedUser=typeof req.username==="string"&&req.username.length>0;
   const providedPassword=typeof req.password==="string"&&req.password.length>0;
   if(providedUser!==providedPassword)throw Error("CREDENTIAL_PAIR_REQUIRED");
   const username=providedUser?req.username:env.TEST_LOGIN_USERNAME;
   const password=providedPassword?req.password:env.TEST_LOGIN_PASSWORD;
   if(typeof username!=="string"||!username||username.length>100||
      typeof password!=="string"||password.length<12||password.length>128)
     throw Error("TEST_CREDENTIALS_INVALID");
   const login=await gas(env,"auth","login",{username,password});
   if(!login.ok)loginError="LOGIN_DENIED_"+code(login.error?.code);
   else if(!/^[0-9a-f]{64}$/i.test(login.data?.sessionToken||""))loginError="SESSION_TOKEN_INVALID";
   else token=login.data.sessionToken;
  }
  if(!loginError){
   const result=await gas(env,group,action,req.payload,token,method,requestId);
   backend={ok:result.ok,errorCode:result.ok?null:code(result.error?.code),
    // No raw response, counts, identifiers, usernames, vehicles, phones, or personal data in report.
    responseType:result.ok?(Array.isArray(result.data)?"array":typeof result.data):null};
  }
 }finally{
  if(token){
   logoutAttempted=true;
   try{
    const result=await gas(env,"auth","logout",{},token);
    logoutRevoked=result.ok===true&&result.data?.revoked===true;
   }catch{logoutRevoked=false;}
  }
 }
 return {service:"p6vc-api-test-console",kind:"probe",generatedAt:new Date().toISOString(),
  operation,method,requestId,authenticated,transport:loginError?"NOT_ATTEMPTED":"PASS",
  backend,loginError,elapsedMs:Date.now()-started,logoutAttempted,logoutRevoked,
  rawResponseIncluded:false,credentialsExposed:false,sessionTokensExposed:false};
}


/* Data-driven dev test runner.
 * Frontend and future MCP can invoke the same POST /api/run-tests API.
 * Accepts only read-only operations from server allowlist and bounded JSON.
 * For each case explicit expected.ok is mandatory (no false positive on HTTP 200).
 */
function validateSuite(input){
 if(!Array.isArray(input.cases)||input.cases.length<1||input.cases.length>10)
  throw Error("INVALID_CASE_COUNT");
 const ids=new Set();
 for(const c of input.cases){
  if(!c||typeof c!=="object"||Array.isArray(c))throw Error("INVALID_CASE");
  if(typeof c.id!=="string"||!/^[A-Za-z0-9_.-]{2,64}$/.test(c.id)||ids.has(c.id))
   throw Error("INVALID_CASE_ID");
  ids.add(c.id);
  if(!READ_ONLY_OPERATIONS.has(c.operation)||!safePayload(c.payload))
   throw Error("UNSAFE_CASE");
  if(!["GET","POST"].includes(c.method||"POST")||
     c.method==="GET"&&c.operation!=="system.health")throw Error("INVALID_CASE_METHOD");
  if(!c.expected||typeof c.expected!=="object"||typeof c.expected.ok!=="boolean")
   throw Error("EXPECTED_RESULT_REQUIRED");
  if(c.expected.errorCode!==undefined&&
     (typeof c.expected.errorCode!=="string"||!/^[A-Z0-9_]{2,80}$/.test(c.expected.errorCode)))
   throw Error("INVALID_EXPECTED_ERROR");
 }
}
function suiteId(input){
 return typeof input.suiteId==="string"&&/^[A-Za-z0-9_.-]{2,50}$/.test(input.suiteId)?
  input.suiteId:"manual-dev-suite";
}
async function runTestSuite(env,input){
 validateSuite(input);
 const normalizedSuiteId=suiteId(input);
 const rows=[];
 const started=Date.now();
 for(const c of input.cases){
  const startedAt=Date.now();
  let observed=null;
  try{
   const result=await apiProbe(env,{
    operation:c.operation,method:c.method||"POST",payload:c.payload,
    useTestSession:c.useTestSession===true,
    username:input.username||"",password:input.password||""
   });
   observed={transport:result.transport,ok:result.backend?.ok??null,
    errorCode:result.backend?.errorCode??null,logoutRevoked:result.logoutRevoked};
   const passed=!result.error&&!result.loginError&&
    result.backend?.ok===c.expected.ok&&
    (c.expected.errorCode===undefined||result.backend?.errorCode===c.expected.errorCode)&&
    (!result.authenticated||result.logoutRevoked===true);
   rows.push({id:c.id,operation:c.operation,status:passed?"PASS":"FAIL",
    ms:Date.now()-startedAt,observed});
  }catch(e){
   rows.push({id:c.id,operation:c.operation,status:"FAIL",ms:Date.now()-startedAt,
    observed:{errorCode:code(e.message)}});
  }
 }
 const passed=rows.filter(x=>x.status==="PASS").length;
 return {service:"p6vc-api-test-console",kind:"suite",suiteId:normalizedSuiteId,generatedAt:new Date().toISOString(),
  status:passed===rows.length?"PASS":"FAIL",executed:rows.length,passed,failed:rows.length-passed,
  elapsedMs:Date.now()-started,results:rows,rawResponseIncluded:false,
  credentialsExposed:false,sessionTokensExposed:false};
}

function jobStore(env){
 const store=env.TEST_JOB_STORE;
 return store&&typeof store.get==="function"&&typeof store.put==="function"?store:null;
}
function jobTtl(env){
 const value=Number(env.TEST_JOB_TTL_SECONDS);
 return Number.isInteger(value)&&value>=3600&&value<=JOB_TTL_SECONDS?value:JOB_TTL_SECONDS;
}
async function digest(value){
 const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
 return Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
}
async function readJob(store,jobId){
 const raw=await store.get("job:"+jobId);
 if(typeof raw!=="string"||!raw)return null;
 try{return JSON.parse(raw);}catch{return null;}
}
async function writeJob(store,record,ttl){
 await store.put("job:"+record.jobId,JSON.stringify(record),{expirationTtl:ttl});
}
async function createTestJob(request,env,input){
 const store=jobStore(env);
 if(!store)return reply({error:"JOB_STORE_NOT_CONFIGURED"},503);
 const key=request.headers.get("idempotency-key")||"";
 if(!IDEMPOTENCY_KEY.test(key))return reply({error:"IDEMPOTENCY_KEY_REQUIRED"},400);
 if(Object.keys(input).some(x=>!["suiteId","cases"].includes(x)))
  return reply({error:"JOB_FIELDS_NOT_ALLOWED"},400);
 try{validateSuite(input);}catch(e){return reply({error:code(e.message)},400);}
 const ttl=jobTtl(env),fingerprint=await digest(key),requestHash=await digest(JSON.stringify(input));
 const idempotencyRecord="idempotency:"+fingerprint,existingRaw=await store.get(idempotencyRecord);
 let existingMap=null;
 try{existingMap=typeof existingRaw==="string"?JSON.parse(existingRaw):null;}catch{}
 if(existingMap?.requestHash&&existingMap.requestHash!==requestHash)
  return reply({error:"IDEMPOTENCY_KEY_REUSED"},409);
 if(existingMap&&JOB_ID.test(existingMap.jobId||"")){
  const existing=await readJob(store,existingMap.jobId);
  if(existing)return reply({...existing,replayed:true});
 }
 const jobId="job_"+crypto.randomUUID().replaceAll("-",""),createdAt=new Date().toISOString();
 let record={service:"p6vc-api-test-console",kind:"test-job",jobId,
  suiteId:suiteId(input),
  status:"RUNNING",createdAt,updatedAt:createdAt,replayed:false,
  credentialsExposed:false,sessionTokensExposed:false};
 try{
  await writeJob(store,record,ttl);
  await store.put(idempotencyRecord,JSON.stringify({jobId,requestHash}),{expirationTtl:ttl});
  const report=await runTestSuite(env,input);
  record={...record,status:"COMPLETED",updatedAt:new Date().toISOString(),report};
  await writeJob(store,record,ttl);
  return reply(record,201);
 }catch{
  record={...record,status:"FAILED",updatedAt:new Date().toISOString(),error:"TEST_EXECUTION_ERROR"};
  try{await writeJob(store,record,ttl);}catch{}
  return reply(record,500);
 }
}
async function getTestJob(env,jobId){
 const store=jobStore(env);
 if(!store)return reply({error:"JOB_STORE_NOT_CONFIGURED"},503);
 if(!JOB_ID.test(jobId))return reply({error:"INVALID_JOB_ID"},400);
 const record=await readJob(store,jobId);
 return record?reply(record):reply({error:"JOB_NOT_FOUND"},404);
}

const PAGE = [
'<!doctype html><html lang="th"><head><meta charset="utf-8">',
'<meta name="viewport" content="width=device-width, initial-scale=1">',
'<meta name="referrer" content="no-referrer"><title>P6VC API Test Console</title>',
'<style>body{font:16px system-ui,sans-serif;background:#0c1728;color:#eaf3fa;max-width:760px;margin:auto;padding:26px 16px}',
'h1{font-size:25px}p{color:#b3ccdb;line-height:1.6}section{background:#15263b;border:1px solid #34516d;border-radius:14px;padding:18px;margin:16px 0}',
'input,select,textarea{box-sizing:border-box;width:100%;padding:12px;color:white;background:#0b1a2d;border:1px solid #56748b;border-radius:8px;margin:6px 0 12px}',
'button{margin:10px 6px 5px 0;padding:12px;border:0;border-radius:8px;background:#5de0de;color:#11232c;font-weight:700}',
'pre{white-space:pre-wrap;word-break:break-word;max-height:420px;overflow:auto;background:#07101d;padding:14px;border-radius:9px}',
'.warn{color:#ffd7ab}.hint{font-size:13px;color:#b3ccdb}.check{width:auto}</style></head><body><h1>P6 Vehicle Contact · API Test Console</h1>',
'<p>ทดสอบ GAS ผ่าน Cloudflare Worker โดยไม่ผ่าน GitHub Actions</p>',
'<section><label for="key">Bridge Access Key</label><input id="key" type="password" autocomplete="off">',
'<p>คีย์นี้ไม่ใช่รหัสผ่าน admin และจะไม่เก็บลงใน Browser Storage</p>',
'<button id="health">ทดสอบ Health API</button><button id="login">ทดสอบ Login 8 กรณี</button>',
'<p class="warn">Login จะสร้าง Security Event/Session ทดสอบ และ Logout เมื่อสำเร็จ ไม่ใช้ข้อมูลจริง</p></section>',

'<section><h2>API Explorer — Read-only POC</h2>',
'<p class="hint">เลือก API, Method, Payload JSON และ Request ID ได้ทันที ไม่ต้องแก้โค้ดหรือ Deploy เมื่อเปลี่ยนค่าทดสอบ</p>',
'<label>API Operation<select id="op">',
'<option value="system.health">system.health</option>',
'<option value="system.config.get">system.config.get</option>',
'<option value="users.list">users.list</option>',
'<option value="organizations.list">organizations.list</option>',
'<option value="campaigns.list">campaigns.list</option>',
'<option value="registrations.listPending">registrations.listPending</option>',
'<option value="vehicles.lookup">vehicles.lookup</option>',
'<option value="vehicles.history">vehicles.history</option>',
'<option value="changes.listPending">changes.listPending</option>',
'<option value="retention.jobStatus">retention.jobStatus</option>',
'</select></label>',
'<label>Method<select id="method"><option value="POST">POST</option><option value="GET">GET (health only)</option></select></label>',
'<label>Payload JSON<textarea id="payload" rows="4" spellcheck="false">{}</textarea></label>',
'<label>Request ID (optional)<input id="reqid" placeholder="สร้างให้อัตโนมัติ"></label>',
'<label><input class="check" type="checkbox" id="authmode"> Login ด้วยบัญชีทดสอบ และ Logout อัตโนมัติ</label>',
'<p class="hint">Username/Password เป็นทางเลือกสำหรับการทดสอบครั้งนั้นเท่านั้น หากเว้นว่างจะใช้ Secrets ใน Worker</p>',
'<label>Test Username<input id="testuser" autocomplete="off" placeholder="optional"></label>',
'<label>Test Password<input id="testpass" type="password" autocomplete="off" placeholder="optional; cleared after request"></label>',
'<button id="probe">ส่ง API Probe</button>',
'<p class="warn hint">ยังไม่อนุญาตการแก้ไขข้อมูลหรือ API ที่ไม่อยู่ใน Read-only Allowlist ผลลัพธ์จะแสดงเฉพาะสถานะและ Error Code ไม่ส่งข้อมูลบุคคลกลับมา</p>',
'</section>',
'<section><h2>Automated Test Suite — JSON</h2>',
'<p class="hint">แก้ Test Cases ในกล่องนี้ได้โดยไม่ต้อง Deploy สูงสุด 10 Read-only cases ต่อครั้ง</p>',
'<label>Test Suite JSON<textarea id="suiteJson" rows="12" spellcheck="false"></textarea></label>',
'<button id="runSuite">Run Test Suite</button>',
'<p class="warn hint">ระบบตรวจ Expected Result และ Error Code จริง ไม่แสดงข้อมูลส่วนบุคคลในรายงาน</p>',
'</section>',
'<section><strong id="state">ยังไม่ได้ทดสอบ</strong><p><button id="copy" disabled>คัดลอกรายงาน JSON</button></p>',
'<pre id="output">กดปุ่มทดสอบเพื่อเริ่มต้น</pre></section>',
'<script nonce="__NONCE__">(function(){',
'const key=document.getElementById("key"),out=document.getElementById("output"),state=document.getElementById("state"),',
'copy=document.getElementById("copy"),h=document.getElementById("health"),l=document.getElementById("login");',
'let last="";async function run(path,body){if(key.value.trim().length<32){state.textContent="กรุณากรอก Access Key";return;}',
'copy.disabled=true;h.disabled=true;l.disabled=true;out.textContent="กำลังทดสอบ...";state.textContent="กำลังเรียก API";',
'try{const headers={authorization:"Bearer "+key.value.trim()};if(body!==undefined)headers["content-type"]="application/json";',
'const r=await fetch(path,{method:"POST",headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(120000),cache:"no-store"});',
'const j=await r.json();if(!r.ok){state.textContent="ERROR "+r.status;out.textContent=j.error||"UNKNOWN";return;}',
'last=JSON.stringify(j,null,2);out.textContent=last;state.textContent=j.result+" "+j.passed+"/"+j.tests.length;copy.disabled=false;',
'}catch{state.textContent="NETWORK_ERROR";out.textContent="ไม่สามารถรับผล HTTP ได้";}',
'finally{h.disabled=false;l.disabled=false;}}',
'h.onclick=()=>run("/api/health");l.onclick=()=>run("/api/auth-suite",{username:document.getElementById("testuser").value,password:document.getElementById("testpass").value}).finally(()=>{document.getElementById("testpass").value="";});',
'copy.onclick=async()=>{try{await navigator.clipboard.writeText(last);state.textContent+=" · คัดลอกแล้ว";}catch{state.textContent+=" · กรุณาเลือกคัดลอกข้อความเอง";}};',
'const probeBtn=document.getElementById("probe");',
'async function runProbe(){',
'if(key.value.trim().length<32){state.textContent="กรุณากรอก Bridge Access Key";return;}',
'let payload;try{payload=JSON.parse(document.getElementById("payload").value);}catch{state.textContent="Payload JSON ไม่ถูกต้อง";return;}',
'const body={operation:document.getElementById("op").value,method:document.getElementById("method").value,',
'requestId:document.getElementById("reqid").value,payload,useTestSession:document.getElementById("authmode").checked,',
'username:document.getElementById("testuser").value,password:document.getElementById("testpass").value};',
'probeBtn.disabled=true;h.disabled=true;l.disabled=true;copy.disabled=true;state.textContent="กำลังเรียก API";out.textContent="กำลังทดสอบ...";',
'try{const r=await fetch("/api/probe",{method:"POST",headers:{authorization:"Bearer "+key.value.trim(),',
'"content-type":"application/json"},body:JSON.stringify(body),cache:"no-store",signal:AbortSignal.timeout(120000)});',
'const j=await r.json();if(!r.ok||j.error){state.textContent="REQUEST BLOCKED "+r.status;out.textContent=j.error||"UNKNOWN";return;}',
'last=JSON.stringify(j,null,2);out.textContent=last;copy.disabled=false;',
'state.textContent=j.transport+" · GAS "+(j.backend?.ok?"OK":j.backend?.errorCode||j.loginError||"UNKNOWN");',
'}catch{state.textContent="NETWORK_ERROR";out.textContent="ไม่สามารถรับผลจาก Worker ได้";}',
'finally{probeBtn.disabled=false;h.disabled=false;l.disabled=false;document.getElementById("testpass").value="";}',
'}',
'probeBtn.onclick=runProbe;',
'const runSuiteBtn=document.getElementById("runSuite");',
'const exampleSuite={suiteId:"smoke-dev",cases:[{id:"T-01",operation:"system.health",method:"POST",payload:{},expected:{ok:true}},{id:"T-02",operation:"users.list",method:"POST",payload:{limit:1},expected:{ok:false,errorCode:"UNAUTHENTICATED"}}]};',
'document.getElementById("suiteJson").value=JSON.stringify(exampleSuite,null,2);',
'runSuiteBtn.onclick=async()=>{',
'if(key.value.trim().length<32){state.textContent="กรุณากรอก Bridge Access Key";return;}',
'let suite;try{suite=JSON.parse(document.getElementById("suiteJson").value);}catch{state.textContent="Test Suite JSON ไม่ถูกต้อง";return;}',
'runSuiteBtn.disabled=true;h.disabled=true;l.disabled=true;probeBtn.disabled=true;copy.disabled=true;',
'state.textContent="กำลังรัน Test Suite";out.textContent="กำลังทดสอบ...";',
'try{const r=await fetch("/api/run-tests",{method:"POST",headers:{authorization:"Bearer "+key.value.trim(),"content-type":"application/json"},body:JSON.stringify(suite),cache:"no-store",signal:AbortSignal.timeout(120000)});',
'const j=await r.json();if(!r.ok){state.textContent="SUITE ERROR "+r.status;out.textContent=j.error||"UNKNOWN";return;}',
'last=JSON.stringify(j,null,2);out.textContent=last;copy.disabled=false;',
'state.textContent="Test Suite "+j.status+" "+j.passed+"/"+j.executed;',
'}catch{state.textContent="NETWORK_ERROR";out.textContent="Test Suite ไม่สามารถรับผลได้";}',
'finally{runSuiteBtn.disabled=false;h.disabled=false;l.disabled=false;probeBtn.disabled=false;}',
'};',
'})();</script></body></html>'
].join("");
function serve(){
 const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,"0")).join("");
 return new Response(PAGE.replace("__NONCE__",nonce),{headers:{
 "content-type":"text/html; charset=utf-8","cache-control":"no-store","x-frame-options":"DENY",
 "referrer-policy":"no-referrer","x-content-type-options":"nosniff",
 "content-security-policy":"default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
 }});
}
export default {async fetch(request,env){
 const path=new URL(request.url).pathname;
 if(request.method==="GET"&&(path==="/"||path==="/index.html"))return serve();
 if(path==="/api/frontend"){
  const origin=allowedFrontendOrigin(request,env);
  if(!origin)return reply({error:"ORIGIN_NOT_ALLOWED"},403);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:frontendHeaders(origin)});
  if(request.method!=="POST")return frontendReply(origin,{error:"METHOD_NOT_ALLOWED"},405);
  if(!upstream(env))return frontendReply(origin,{error:"GATEWAY_NOT_CONFIGURED"},503);
  return frontendGateway(request,env,origin);
 }
 const jobMatch=/^\/api\/jobs\/(job_[0-9a-f]{32})$/.exec(path);
 const postAllowed=request.method==="POST"&&["/api/health","/api/auth-suite","/api/probe","/api/run-tests","/api/jobs"].includes(path);
 if(!postAllowed&&!(request.method==="GET"&&jobMatch))return reply({error:"NOT_FOUND"},404);
 if(!upstream(env)||!env.BRIDGE_ACCESS_KEY||env.BRIDGE_ACCESS_KEY.length<32)return reply({error:"BRIDGE_NOT_CONFIGURED"},503);
 const header=request.headers.get("authorization")||"";
 const m=/^Bearer (\S+)$/.exec(header);
 if(!m||!(await sameKey(m[1],env.BRIDGE_ACCESS_KEY)))return reply({error:"UNAUTHORIZED"},401);
 if(jobMatch)return getTestJob(env,jobMatch[1]);
 const raw=await request.text();
 if(raw.length>8192)return reply({error:"REQUEST_TOO_LARGE"},413);
 let args={};
 if(raw){
  if(request.headers.get("content-type")?.split(";")[0]!=="application/json")
   return reply({error:"JSON_REQUIRED"},415);
  try{args=JSON.parse(raw);}catch{return reply({error:"INVALID_JSON"},400);}
  if(!args||typeof args!=="object"||Array.isArray(args))return reply({error:"INVALID_BODY"},400);
 }
 if(path==="/api/health"&&raw)return reply({error:"BODY_NOT_ALLOWED"},400);
 if(path==="/api/probe"&&(!READ_ONLY_OPERATIONS.has(args.operation)||!safePayload(args.payload)))
  return reply({error:"OPERATION_OR_PAYLOAD_NOT_ALLOWED"},403);
 if(path==="/api/jobs")return createTestJob(request,env,args);
 try{return reply(path==="/api/health"?await health(env):
   path==="/api/auth-suite"?await auth(env,args):
   path==="/api/run-tests"?await runTestSuite(env,args):await apiProbe(env,args));}
 catch{return reply({error:"TEST_EXECUTION_ERROR"},500);}
}};
