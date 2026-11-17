import {validateApiRequest} from '../dto/RequestValidator.js';
import {apiSuccess,apiFailure} from '../responses/ResponseFactory.js';
import {systemHealth} from '../groups/system/SystemGroup.js';
// Public health stays available. Protected ingress is explicitly feature-gated server-side.
export function createApiRouter({createProtectedDispatcher}={}) {
 return Object.freeze({dispatch(request,method) {
  const id=typeof request?.requestId==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(request.requestId)?request.requestId:null;
  try{
   validateApiRequest(request);
   if(request.group==='system'&&request.action==='health')return apiSuccess(systemHealth(),id);
   if(method!=='POST')return apiFailure('METHOD_NOT_ALLOWED','POST required',id);
   if(typeof createProtectedDispatcher!=='function')return apiFailure('SERVICE_UNAVAILABLE','Feature not enabled',id);
   return createProtectedDispatcher().dispatch(request);
  }catch(_){
   return apiFailure('SERVICE_UNAVAILABLE','Operation unavailable or invalid',id);
  }
 }});
}
