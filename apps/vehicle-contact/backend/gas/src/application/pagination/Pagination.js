export const ALLOWED_PAGE_SIZES=Object.freeze([1,5,10,15,25,50,100]);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);

// TUNEUP R1: the same validation as paginate(), but returns HOW MANY rows the request needs
// (page*pageSize, or the legacy limit) so the store reads only that window, never the collection.
export function pageWindow(payload={},options={}){
 const hasPage=own(payload,'page'),hasPageSize=own(payload,'pageSize');
 if(hasPage||hasPageSize){
  if(own(payload,'limit')||!hasPage||!hasPageSize||!Number.isSafeInteger(payload.page)||payload.page<1
   ||!ALLOWED_PAGE_SIZES.includes(payload.pageSize))throw new Error('INVALID_PAGINATION');
  return {legacy:false,page:payload.page,pageSize:payload.pageSize,n:payload.page*payload.pageSize};
 }
 const defaultLimit=options.defaultLimit??50,maxLegacyLimit=options.maxLegacyLimit??100;
 const limit=payload.limit===undefined?defaultLimit:payload.limit;
 if(!Number.isSafeInteger(limit)||limit<1||limit>maxLegacyLimit)throw new Error('INVALID_LIMIT');
 return {legacy:true,n:limit};
}
// rows = the first window rows (already ordered); total = COUNT of the whole filtered set.
export function pageOf(rows,total,w){
 if(w.legacy)return rows.slice(0,w.n);
 const start=(w.page-1)*w.pageSize;
 return {items:rows.slice(start,start+w.pageSize),total,page:w.page,pageSize:w.pageSize,totalPages:Math.ceil(total/w.pageSize)};
}
// One parallel round on Firestore: the window rows + the COUNT. Stores without readMany/count
// (tests, legacy) fall back to a full read — same result, no saving.
export function readPage(store,{name,filter={},newest=false,map=x=>x},payload,options){
 const w=pageWindow(payload,options),kind=newest?'newest':'list';
 if(typeof store.readMany==='function'&&typeof store.count==='function'){
  const [rows,total]=store.readMany([{kind,name,filter,limit:w.n},{kind:'count',name,filter}]);
  return pageOf(rows.map(map),total,w);
 }
 const all=store.list(name,filter),ordered=newest?all.slice().reverse():all;
 return pageOf(ordered.slice(0,w.n).map(map),ordered.length,w);
}

export function paginate(items,payload={},options={}) {
 if(!Array.isArray(items))throw new Error('INVALID_PAGINATION');
 const hasPage=own(payload,'page'),hasPageSize=own(payload,'pageSize');
 if(hasPage||hasPageSize){
  if(own(payload,'limit')||!hasPage||!hasPageSize||!Number.isSafeInteger(payload.page)||payload.page<1
   ||!ALLOWED_PAGE_SIZES.includes(payload.pageSize))throw new Error('INVALID_PAGINATION');
  const total=items.length,page=payload.page,pageSize=payload.pageSize,totalPages=Math.ceil(total/pageSize);
  const start=(page-1)*pageSize;
  return {items:items.slice(start,start+pageSize),total,page,pageSize,totalPages};
 }
 const defaultLimit=options.defaultLimit??50,maxLegacyLimit=options.maxLegacyLimit??100;
 const limit=payload.limit===undefined?defaultLimit:payload.limit;
 if(!Number.isSafeInteger(limit)||limit<1||limit>maxLegacyLimit)throw new Error('INVALID_LIMIT');
 return items.slice(0,limit);
}
