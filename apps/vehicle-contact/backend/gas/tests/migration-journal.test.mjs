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
 assert.throws(()=>runner.execute(),/GATES_BLOCKED/);
});

test('guarded executor completes create-table migration with synthetic adapter',()=>{
 const events=[],tables={vc_vehicles:['vehicle_id']},journal=new Map();
 const adapter={
  inspect(){return structuredClone(tables)},
  acquireLock(){events.push('lock');return true},
  releaseLock(){events.push('unlock')},
  readJournal(id){return journal.get(id)},
  writeJournal(e){journal.set(e.id,{...e});events.push(e.status)},
  backup(){events.push('backup');return 'backup-synthetic'},
  applyOperation(op){tables[op.table]=[...op.columns];events.push('create')},
  verify(m){assert.deepEqual(tables.vc_security_events,['event_id']);return {verification_ref:'verify-synthetic'}}
 };
 const migration={id:'VC_0002_SECURITY_EVENTS',checksum:'sha256:synthetic',operations:[{type:'create_table',table:'vc_security_events',columns:['event_id']}]};
 const gates={approved:true,backupVerified:true,lockHeld:true,journalReady:true,stagingVerified:true,legalGate:true,securityGate:true};
 const runner=createMigrationRunner(adapter);
 assert.equal(runner.execute(migration,gates).status,'APPLIED');
 assert.equal(runner.execute(migration,gates).status,'ALREADY_APPLIED');
 assert.deepEqual(events.slice(0,7),['lock','PREPARED','backup','BACKED_UP','APPLYING','create','VERIFYING']);
 assert.equal(events.includes('APPLIED'),true);
});
test('executor fails closed on injected write failure and records recovery state',()=>{
 const journal=[];
 const adapter={
  inspect(){return{}},acquireLock(){return true},releaseLock(){},
  readJournal(){return null},writeJournal(e){journal.push(e.status)},
  backup(){return 'backup-synthetic'},applyOperation(){throw new Error('INJECTED_WRITE_FAILURE')},
  verify(){return {verification_ref:'unreachable'}}
 };
 const runner=createMigrationRunner(adapter);
 const gates={approved:true,backupVerified:true,lockHeld:true,journalReady:true,stagingVerified:true,legalGate:true,securityGate:true};
 assert.throws(()=>runner.execute({id:'VC_0002_SECURITY_EVENTS',checksum:'sha256:synthetic',operations:[{type:'create_table',table:'vc_security_events',columns:['event_id']}]},gates),/INJECTED_WRITE_FAILURE/);
 assert.equal(journal.at(-1),'RECOVERY_REQUIRED');
});
