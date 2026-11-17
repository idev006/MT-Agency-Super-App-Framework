// Controlled coordinator. No public HTTP route; caller must be a privileged GAS Editor operation.
import {planAdditiveMigration} from './MigrationPlanner.js';
import {migrationExecutionReadiness,validateJournalTransition} from './MigrationJournal.js';
export function createMigrationRunner(adapter){
 const required=['inspect','acquireLock','releaseLock','readJournal','writeJournal','backup','applyOperation','verify'];
 if(!adapter||typeof adapter.inspect!=='function') throw new Error('MIGRATION_ADAPTER_REQUIRED');
 return Object.freeze({
  dryRun(migration,applied=[]){return planAdditiveMigration({migration,observed:adapter.inspect(),applied});},
  assessReadiness(gates){return migrationExecutionReadiness(gates||{});},
  execute(migration,gates){
   const readiness=migrationExecutionReadiness(gates||{});
   if(!readiness.ready) throw new Error('MIGRATION_GATES_BLOCKED:'+readiness.missing.join(','));
   for(const method of required) if(typeof adapter[method]!=='function') throw new Error('MIGRATION_ADAPTER_MISSING_'+method);
   if(!adapter.acquireLock()) throw new Error('MIGRATION_LOCK_UNAVAILABLE');
   let state=null;
   try{
    const existing=adapter.readJournal(migration.id);
    if(existing && existing.status==='APPLIED'){
     const plan=planAdditiveMigration({migration,observed:adapter.inspect(),applied:[existing]});
     return {status:plan.status,migrationId:migration.id};
    }
    if(existing) throw new Error('MIGRATION_INCOMPLETE_REQUIRES_MANUAL_RECOVERY');
    const plan=planAdditiveMigration({migration,observed:adapter.inspect()});
    if(plan.operations.some(op=>op.type==='add_column')) throw new Error('ADD_COLUMN_EXECUTOR_NOT_APPROVED');
    state={id:migration.id,checksum:migration.checksum,status:'PREPARED'};
    validateJournalTransition(null,state);adapter.writeJournal(state);
    const backupRef=adapter.backup();
    if(!backupRef) throw new Error('BACKUP_NOT_VERIFIED');
    let next={...state,status:'BACKED_UP',backup_ref:backupRef};
    validateJournalTransition(state,next);adapter.writeJournal(next);state=next;
    next={...state,status:'APPLYING'};
    validateJournalTransition(state,next);adapter.writeJournal(next);state=next;
    for(const op of plan.operations) if(op.type==='create_table') adapter.applyOperation(op);
    next={...state,status:'VERIFYING'};
    validateJournalTransition(state,next);adapter.writeJournal(next);state=next;
    const verified=adapter.verify(migration,plan);
    if(!verified||!verified.verification_ref) throw new Error('POST_MIGRATION_VERIFICATION_FAILED');
    next={...state,status:'APPLIED',verification_ref:verified.verification_ref};
    validateJournalTransition(state,next);adapter.writeJournal(next);state=next;
    return {status:'APPLIED',migrationId:migration.id,backup_ref:backupRef,verification_ref:verified.verification_ref};
   }catch(error){
    if(state && state.status!=='APPLIED'){
     const failureStatus=['APPLYING','VERIFYING'].includes(state.status)?'RECOVERY_REQUIRED':'FAILED';
     try{const failed={...state,status:failureStatus};validateJournalTransition(state,failed);adapter.writeJournal(failed);}catch(_journalError){throw new Error('MIGRATION_JOURNAL_FAILURE_REQUIRES_MANUAL_RECOVERY');}
    }
    throw error;
   }finally{adapter.releaseLock();}
  }
 });
}
