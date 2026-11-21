// Explicit per-group v1 operation allowlist. Each group owns a bounded business capability.
const GROUPS=Object.freeze({
 system:Object.freeze(['health','config.get','config.update']),
 auth:Object.freeze(['login','googleLogin','changePassword','logout','session','linkGoogle']),
 users:Object.freeze(['create','list','update','suspend','resetPassword','assignRoles']),
 organizations:Object.freeze(['list','create','update','disable']),
 campaigns:Object.freeze(['create','list','validate','revoke']),
 references:Object.freeze(['registration']),
 registrations:Object.freeze(['submit','listPending','detail','review','photo']),
 vehicles:Object.freeze(['lookup','detail','update','cancel','history','listMine']),
 contacts:Object.freeze(['read','update']),
 changes:Object.freeze(['submit','listPending','review','listMine']),
 qr:Object.freeze(['resolve','issue','revoke','replace']),
 photos:Object.freeze(['upload','list','replace']),
 retention:Object.freeze(['listDue','listExecutable','approve','execute','jobStatus']),
 audit:Object.freeze(['query','export'])
});
export const API_GROUPS=GROUPS;
export function isDeclaredRoute(group,action) {
 return Object.prototype.hasOwnProperty.call(GROUPS,group)&&GROUPS[group].includes(action);
}
