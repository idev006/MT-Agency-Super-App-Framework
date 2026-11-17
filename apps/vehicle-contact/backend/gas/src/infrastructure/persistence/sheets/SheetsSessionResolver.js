import {authorizeSession} from '../../../domain/policies/SessionPolicy.js';

// Server-side session resolution. Never trust a principal or permission array in the request.
export function createSessionResolver({spreadsheetApp,spreadsheetId,sha256,now}) {
 if(!spreadsheetApp||typeof spreadsheetApp.openById!=='function'||!spreadsheetId||typeof sha256!=='function'||typeof now!=='function')
  throw new Error('SESSION_RESOLVER_NOT_CONFIGURED');
 function read(book,table,required){
  const sheet=book.getSheetByName(table);
  if(!sheet)throw new Error('SCHEMA_MISMATCH');
  const values=sheet.getDataRange().getValues();
  if(!values.length)throw new Error('SCHEMA_MISMATCH');
  const headers=values[0].map(String);
  if(headers.some(h=>!h)||new Set(headers).size!==headers.length||required.some(h=>!headers.includes(h)))throw new Error('SCHEMA_MISMATCH');
  return values.slice(1).filter(row=>row.some(v=>v!==''&&v!==null))
   .map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]])));
 }
 return Object.freeze({
  authorize(bearerToken,permission){
   if(typeof bearerToken!=='string'||!/^[a-f0-9]{64}$/i.test(bearerToken))throw new Error('UNAUTHENTICATED');
   if(typeof permission!=='string'||!permission)throw new Error('FORBIDDEN');
   const digest=sha256(bearerToken.toLowerCase());
   if(typeof digest!=='string'||!/^[a-f0-9]{64}$/i.test(digest))throw new Error('SESSION_DIGEST_INVALID');
   const book=spreadsheetApp.openById(spreadsheetId);
   const sessions=read(book,'vc_sessions',['user_id','token_digest','status','issued_at','expires_at','last_seen_at','idle_timeout_minutes']);
   const matches=sessions.filter(s=>String(s.token_digest).toLowerCase()===digest.toLowerCase());
   if(matches.length!==1)throw new Error('UNAUTHENTICATED');
   const users=read(book,'vc_users',['user_id','status','password_change_required']);
   const found=users.filter(u=>u.user_id===matches[0].user_id);
   if(found.length!==1)throw new Error('UNAUTHENTICATED');
   const permissions=read(book,'vc_user_permissions',['user_id','permission','status'])
    .filter(p=>p.user_id===found[0].user_id&&p.status==='ACTIVE').map(p=>String(p.permission));
   // Never take permissions from the session row or the client request.
   const user={...found[0],password_change_required:found[0].password_change_required===true||String(found[0].password_change_required).toLowerCase()==='true',permissions};
   return authorizeSession(matches[0],user,now(),permission);
  }
 });
}
