// Migration journal state machine. Pure; persistence belongs to the protected adapter.
const TERMINAL=new Set(['APPLIED','FAILED','RECOVERY_REQUIRED']);
export function validateJournalTransition(previous,next){
 if(!next||typeof next!=='object'||!/^VC_[0-9]{4}_[A-Z0-9_]+$/.test(next.id)||typeof next.checksum!=='string'||!next.checksum.startsWith('sha256:')) throw new Error('INVALID_JOURNAL_ENTRY');
 if(!previous){if(next.status!=='PREPARED') throw new Error('MIGRATION_MUST_START_PREPARED');return true;}
 if(previous.id!==next.id||previous.checksum!==next.checksum) throw new Error('JOURNAL_IDENTITY_MISMATCH');
 if(TERMINAL.has(previous.status)) throw new Error('TERMINAL_JOURNAL_IMMUTABLE');
 const transitions={PREPARED:['BACKED_UP','FAILED'],BACKED_UP:['APPLYING','FAILED'],APPLYING:['VERIFYING','RECOVERY_REQUIRED'],VERIFYING:['APPLIED','RECOVERY_REQUIRED']};
 if(!(transitions[previous.status]||[]).includes(next.status)) throw new Error('ILLEGAL_MIGRATION_TRANSITION');
 if(['BACKED_UP','APPLYING','VERIFYING','APPLIED'].includes(next.status)&&!next.backup_ref) throw new Error('MISSING_BACKUP_REFERENCE');
 if(next.status==='APPLIED'&&!next.verification_ref) throw new Error('MISSING_VERIFICATION_REFERENCE');
 return true;
}
export function migrationExecutionReadiness({approved,backupVerified,lockHeld,journalReady,stagingVerified,legalGate,securityGate}){
 const missing=[];
 for(const [key,value] of Object.entries({approved,backupVerified,lockHeld,journalReady,stagingVerified,legalGate,securityGate})) if(value!==true) missing.push(key);
 return {ready:missing.length===0,missing};
}
