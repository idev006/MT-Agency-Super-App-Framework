import {executeVehicleApi,API_OPERATIONS} from '../../application/use-cases/VehicleApi.js';
import {validateApiRequest} from '../dto/RequestValidator.js';
import {apiSuccess,apiFailure} from '../responses/ResponseFactory.js';
const allowed=new Set(API_OPERATIONS);
export function dispatchTrustedApi(request,context) {
 const id=request&&typeof request.requestId==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(request.requestId)?request.requestId:null;
 try {
  validateApiRequest(request);
  const operation=request.group+'.'+request.action;
  if(!allowed.has(operation))return apiFailure('NOT_FOUND','Unavailable operation',id);
  // Never accept principal, verified campaign or trust from the request body.
  if(!context||context.trustedBoundary!==true)return apiFailure('SERVICE_UNAVAILABLE','Secure ingress unavailable',id);
  return apiSuccess(executeVehicleApi(operation,request.payload,context),id);
 } catch(e) {
  const code=String(e&&e.message||'ERROR');
  const safe=['FORBIDDEN','CAMPAIGN_NOT_VERIFIED','FIVE_PHOTOS_REQUIRED','INVALID_DECISION','SECURE_BOUNDARY_UNAVAILABLE','UNKNOWN_OPERATION'].includes(code)?code:'INVALID_REQUEST';
  return apiFailure(safe,'Operation denied or invalid',id);
 }
}
