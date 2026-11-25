// Operation-level request DTO gate; never trust unlisted client-controlled fields.
// Type codes: s=non-empty bounded string, x=credential/large string, n=integer, b=boolean, a=array, o=object.
const SCHEMAS={
 'system.config.get':[{},{}],
 'system.config.update':[{values:'o'},{}],
 'auth.login':[{username:'s',password:'x'},{}],
 'auth.googleLogin':[{idToken:'x'},{}],
 'auth.changePassword':[{oldPassword:'x',newPassword:'x'},{}],
 'auth.logout':[{},{}],
 'auth.session':[{},{}],
 'auth.linkGoogle':[{password:'x',idToken:'x'},{}],
 'users.create':[{username:'s',displayName:'s',temporaryPassword:'x'},{organizationId:'s'}],
 'users.list':[{}, {limit:'n',page:'n',pageSize:'n'}],
 'users.update':[{userId:'s'},{displayName:'s',organizationId:'s'}],
 'users.suspend':[{userId:'s'},{}],
 'users.reactivate':[{userId:'s'},{}],
 'users.resetPassword':[{userId:'s',temporaryPassword:'x'},{}],
 'users.assignRoles':[{userId:'s',roles:'a'},{}],
 'organizations.list':[{}, {limit:'n',page:'n',pageSize:'n'}],
 'organizations.create':[{name:'s',type:'s'},{parentId:'s'}],
 'organizations.update':[{organizationId:'s'},{name:'s',parentId:'s'}],
 'organizations.disable':[{organizationId:'s'},{}],
 'organizations.enable':[{organizationId:'s'},{}],
 'campaigns.create':[{startsAt:'s',endsAt:'s',maxSubmissions:'n'},{name:'s'}],
 'campaigns.list':[{}, {limit:'n',page:'n',pageSize:'n'}],
 'campaigns.validate':[{campaignToken:'s'},{}],
 'campaigns.revoke':[{campaignId:'s'},{}],
 'references.registration':[{},{}],
 'registrations.submit':[{campaignToken:'s',plate:'s',province:'s',plateType:'s',vehicleType:'s',
   brand:'s',model:'s',color:'s',organizationId:'s',relationship:'s',contactName:'s',contactPhone:'s',
   photos:'a',idempotencyKey:'s'},{referenceVersion:'s'}],
 'registrations.listPending':[{}, {limit:'n',page:'n',pageSize:'n'}],
 'registrations.detail':[{requestId:'s'},{}],
 'registrations.review':[{requestId:'s',decision:'s'},{platePhotoVerified:'b'}],
 'registrations.photo':[{requestId:'s',photoId:'s'},{}],
 'vehicles.photo':[{vehicleId:'s',photoId:'s'},{}],
 'vehicles.lookup':[{plate:'s',province:'s'},{}],
 'vehicles.detail':[{vehicleId:'s'},{}],
 'vehicles.update':[{vehicleId:'s',expectedVersion:'n'},
   {plate:'s',province:'s',plateType:'s',vehicleType:'s',brand:'s',model:'s',color:'s',ownerUserId:'s'}],
 'vehicles.cancel':[{vehicleId:'s'},{}],
 'vehicles.history':[{vehicleId:'s'},{}],
 'vehicles.listMine':[{}, {limit:'n',page:'n',pageSize:'n'}],
 'vehicles.list':[{}, {limit:'n',page:'n',pageSize:'n'}],
 'contacts.read':[{vehicleId:'s'},{}],
 'contacts.update':[{vehicleId:'s'},{contactName:'s',contactPhone:'s'}],
 'changes.submit':[{vehicleId:'s'},{contactName:'s',contactPhone:'s',brand:'s',model:'s',color:'s'}],
 'changes.listPending':[{}, {limit:'n',page:'n',pageSize:'n'}],
 'changes.review':[{requestId:'s',decision:'s'},{}],
 'changes.listMine':[{}, {limit:'n',page:'n',pageSize:'n'}],
 'qr.resolve':[{token:'s'},{}],
 'qr.issue':[{vehicleId:'s',reason:'s'},{note:'s'}],
 'qr.revoke':[{vehicleId:'s',reason:'s'},{note:'s'}],
 'qr.replace':[{vehicleId:'s',reason:'s'},{note:'s'}],
 'qr.history':[{vehicleId:'s'},{}],
 'photos.upload':[{campaignToken:'s',slot:'s',base64Image:'x',mimeType:'s'},{}],
 'photos.list':[{vehicleId:'s'},{}],
 'photos.replace':[{vehicleId:'s',slot:'s',base64Image:'x',mimeType:'s'},{}],
 'retention.listDue':[{}, {limit:'n',page:'n',pageSize:'n'}],
 'retention.listExecutable':[{}, {limit:'n',page:'n',pageSize:'n'}],
 'retention.approve':[{jobId:'s'},{}],
 'retention.execute':[{jobId:'s'},{}],
 'retention.jobStatus':[{jobId:'s'},{}],
 'audit.query':[{}, {vehicleId:'s',limit:'n',page:'n',pageSize:'n'}],
 'audit.export':[{}, {vehicleId:'s',limit:'n'}]
};
export const DTO_SCHEMAS=Object.freeze(SCHEMAS);
export const DTO_OPERATIONS=Object.freeze(Object.keys(SCHEMAS));
export function validateOperationPayload(operation,payload){
 const spec=SCHEMAS[operation];
 if(!spec||!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('INVALID_REQUEST');
 const [required,optional]=spec,all={...required,...optional};
 for(const key of Object.keys(required))if(!Object.prototype.hasOwnProperty.call(payload,key))throw new Error('INVALID_REQUEST');
 for(const [key,value] of Object.entries(payload)){
  const kind=all[key];
  if(!kind)throw new Error('INVALID_REQUEST');
  if(kind==='s'&&(typeof value!=='string'||!value.trim()||value.length>256))throw new Error('INVALID_REQUEST');
  if(kind==='x'&&(typeof value!=='string'||!value.length||value.length>7*1024*1024))throw new Error('INVALID_REQUEST');
  if(kind==='n'&&(!Number.isSafeInteger(value)||value<0))throw new Error('INVALID_REQUEST');
  if(kind==='b'&&typeof value!=='boolean')throw new Error('INVALID_REQUEST');
  if(kind==='a'&&!Array.isArray(value))throw new Error('INVALID_REQUEST');
  if(kind==='o'&&(!value||typeof value!=='object'||Array.isArray(value)))throw new Error('INVALID_REQUEST');
 }
 if(operation==='registrations.submit'){
  if(payload.photos.length!==5||payload.photos.some(x=>!x||typeof x!=='object'||Array.isArray(x)
   ||Object.keys(x).some(k=>!['slot','photoId'].includes(k))
   ||typeof x.slot!=='string'||typeof x.photoId!=='string'||!x.photoId))
   throw new Error('INVALID_REQUEST');
 }
 if(operation==='users.assignRoles'&&(!payload.roles.length||payload.roles.length>5
  ||payload.roles.some(x=>typeof x!=='string')))throw new Error('INVALID_REQUEST');
 return payload;
}
