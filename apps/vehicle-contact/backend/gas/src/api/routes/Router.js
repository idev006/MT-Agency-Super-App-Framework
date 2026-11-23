import {isDeclaredRoute} from './GroupRoutes.js';
import {validateApiRequest} from '../dto/RequestValidator.js';
import {apiSuccess,apiFailure} from '../responses/ResponseFactory.js';
import {systemHealth} from '../groups/system/SystemGroup.js';
// Public health stays available. Protected ingress is explicitly feature-gated server-side.
export function createApiRouter({createProtectedDispatcher,readHealthInfo}={}) {
 return Object.freeze({dispatch(request,method) {
  const id=typeof request?.requestId==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(request.requestId)?request.requestId:null;
  try{
   validateApiRequest(request);
   if(!isDeclaredRoute(request.group,request.action))return apiFailure('NOT_FOUND','Unknown API operation',id);
   if(request.group==='system'&&request.action==='health')return apiSuccess(systemHealth(typeof readHealthInfo==='function'?readHealthInfo():undefined),id);
   if(method!=='POST')return apiFailure('METHOD_NOT_ALLOWED','POST required',id);
   if(typeof createProtectedDispatcher!=='function')return apiFailure('SERVICE_UNAVAILABLE','Feature not enabled',id);
   return createProtectedDispatcher().dispatch(request);
  }catch(e){
   if(e&&e.message==='BAD_REQUEST')return apiFailure('BAD_REQUEST','Invalid request',id);
   return apiFailure('SERVICE_UNAVAILABLE','Operation unavailable',id);
  }
 }});
}
