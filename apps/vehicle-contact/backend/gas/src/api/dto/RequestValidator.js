export function validateApiRequest(req) {
 if(!req||typeof req!=='object'||Array.isArray(req))throw new Error('BAD_REQUEST');
 if(req.apiVersion!=='v1')throw new Error('BAD_REQUEST');
 if(typeof req.group!=='string'||!/^[a-z][a-z0-9-]{0,39}$/.test(req.group))throw new Error('BAD_REQUEST');
 if(typeof req.action!=='string'||!/^[a-z][a-zA-Z0-9.-]{0,39}$/.test(req.action))throw new Error('BAD_REQUEST');
 if(req.payload!==undefined&&(!req.payload||typeof req.payload!=='object'||Array.isArray(req.payload)))throw new Error('BAD_REQUEST');
 if(req.sessionToken!==undefined&&(typeof req.sessionToken!=='string'||req.sessionToken.length>128))throw new Error('BAD_REQUEST');
}
