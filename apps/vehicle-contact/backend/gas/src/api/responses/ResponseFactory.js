export function apiSuccess(data, requestId) {
  return {ok:true,requestId:requestId||null,data,error:null};
}
export function apiFailure(code,message,requestId) {
  return {ok:false,requestId:requestId||null,data:null,error:{code,message}};
}
