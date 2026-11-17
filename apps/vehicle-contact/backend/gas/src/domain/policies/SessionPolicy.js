// Pure session authorization rules; caller must load authoritative server-side session.
export function authorizeSession(session,user,now,permission) {
 if(!session||!user||session.user_id!==user.user_id||user.status!=='ACTIVE')throw new Error('UNAUTHENTICATED');
 if(session.revoked_at||session.status!=='ACTIVE')throw new Error('SESSION_REVOKED');
 const time=Date.parse(now),issued=Date.parse(session.issued_at),expires=Date.parse(session.expires_at),last=Date.parse(session.last_seen_at);
 if(![time,issued,expires,last].every(Number.isFinite)||time<issued||time>=expires)throw new Error('SESSION_EXPIRED');
 if(!Number.isSafeInteger(session.idle_timeout_minutes)||session.idle_timeout_minutes<1)throw new Error('INVALID_SESSION_POLICY');
 if(time-last>=session.idle_timeout_minutes*60000)throw new Error('SESSION_IDLE_EXPIRED');
 if(user.password_change_required)throw new Error('PASSWORD_CHANGE_REQUIRED');
 if(!Array.isArray(user.permissions)||!user.permissions.includes(permission))throw new Error('FORBIDDEN');
 return Object.freeze({userId:user.user_id,permissions:[...user.permissions]});
}
export function sessionExpiry(issuedAt,minutes=480){
 const start=Date.parse(issuedAt);
 if(!Number.isFinite(start)||!Number.isSafeInteger(minutes)||minutes<1||minutes>43200)throw new Error('INVALID_SESSION_POLICY');
 return new Date(start+minutes*60000).toISOString();
}
export function assertCampaignActive(campaign,now){
 if(!campaign||campaign.revoked_at)throw new Error('CAMPAIGN_REVOKED');
 const start=Date.parse(campaign.starts_at),end=Date.parse(campaign.ends_at),time=Date.parse(now);
 if(![start,end,time].every(Number.isFinite)||time<start||time>=end)throw new Error('CAMPAIGN_INACTIVE');
 if(!Number.isSafeInteger(campaign.max_submissions)||campaign.max_submissions<1||!Number.isSafeInteger(campaign.submitted_count)||campaign.submitted_count>=campaign.max_submissions)throw new Error('CAMPAIGN_QUOTA_EXCEEDED');
 return true;
}
