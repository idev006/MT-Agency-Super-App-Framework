export const ALLOWED_PAGE_SIZES=Object.freeze([1,5,10,15,25,50,100]);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);

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
