import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateJournalTransition,migrationExecutionReadiness} from '../src/application/migrations/MigrationJournal.js';
import {createMigrationRunner} from '../src/application/migrations/MigrationRunner.js';
const base={id:'VC_0002_SECURITY_EVENTS',checksum:'sha256:fixture'};
test('migration journal enforces backed up, verified transitions',()=>{
 const prepared={...base,status:'PREPARED'};
 const backed={...base,status:'BACKED_UP',backup_ref:'backup-1'};
 const applying={...backed,status:'APPLYING'};
 const verifying={...backed,status:'VERIFYING'};
 const applied={...backed,status:'APPLIED',verification_ref:'verify-1'};
 assert.equal(validateJournalTransition(null,prepared),true);
 assert.equal(validateJournalTransition(prepared,backed),true);
 assert.equal(validateJournalTransition(backed,applying),true);
 assert.equal(validateJournalTransition(applying,verifying),true);
 assert.equal(validateJournalTransition(verifying,applied),true);
 assert.throws(()=>validateJournalTransition(prepared,{...prepared,status:'APPLIED'}),/ILLEGAL/);
 assert.throws(()=>validateJournalTransition(applied,prepared),/TERMINAL/);
 assert.throws(()=>validateJournalTransition(prepared,{...backed,checksum:'sha256:changed'}),/IDENTITY/);
});
test('execution readiness requires every independent gate',()=>{
 assert.equal(migrationExecutionReadiness({}).ready,false);
 const all={approved:true,backupVerified:true,lockHeld:true,journalReady:true,stagingVerified:true,legalGate:true,securityGate:true};
 assert.equal(migrationExecutionReadiness(all).ready,true);
 assert.deepEqual(migrationExecutionReadiness({...all,backupVerified:false}).missing,['backupVerified']);
});
test('runner exposes dry run and refuses execution',()=>{
 const adapter={inspect(){return{vc_vehicles:['vehicle_id']}}};
 const runner=createMigrationRunner(adapter);
 const result=runner.dryRun({id:'VC_0002_SECURITY_EVENTS',checksum:'sha256:fixture',operations:[{type:'create_table',table:'vc_security_events',columns:['event_id']}]});
 assert.equal(result.status,'DRY_RUN');
 assert.throws(()=>runner.execute(),/NOT_IMPLEMENTED/);
});
