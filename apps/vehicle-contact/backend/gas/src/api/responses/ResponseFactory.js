function apiSuccess_(data, requestId) {
  return {ok:true,requestId:requestId||null,data:data,error:null};
}
function apiFailure_(code,message,requestId) {
  return {ok:false,requestId:requestId||null,data:null,error:{code:code,message:message}};
}
