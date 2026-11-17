import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planAdditiveMigration} from '../src/application/migrations/MigrationPlanner.js';
import {createSheetsMigrationAdapter} from '../src/infrastructure/migrations/SheetsMigrationAdapter.js';
const migration={id:'VC_0002_SECURITY_EVENTS',checksum:'sha256:approved-checksum',operations:[{type:'create_table',table:'vc_security_events',columns:['event_id','occurred_at']}]};
test('dry run proposes additive table without mutation',()=>{
 const observed={vc_vehicles:['vehicle_id']};
 const result=planAdditiveMigration({migration,observed});
 assert.equal(result.status,'DRY_RUN');assert.equal(result.operations[0].type,'create_table');
 assert.deepEqual(observed,{vc_vehicles:['vehicle_id']});
});
test('re-run verifies matching table and refuses drift',()=>{
 assert.equal(planAdditiveMigration({migration,observed:{vc_security_events:['event_id','occurred_at']}}).operations[0].type,'verify_existing_table');
 assert.throws(()=>planAdditiveMigration({migration,observed:{vc_security_events:['event_id']}}),/DRIFT/);
});
test('journal rejects checksum change and incomplete run',()=>{
 assert.throws(()=>planAdditiveMigration({migration,observed:{},applied:[{id:migration.id,checksum:'different',status:'APPLIED'}]}),/CHECKSUM/);
 assert.throws(()=>planAdditiveMigration({migration,observed:{},applied:[{id:migration.id,checksum:migration.checksum,status:'FAILED'}]}),/NOT_COMPLETE/);
 assert.equal(planAdditiveMigration({migration,observed:{},applied:[{id:migration.id,checksum:migration.checksum,status:'APPLIED'}]}).status,'ALREADY_APPLIED');
});
test('destructive operations blocked; executor fail closed',()=>{
 assert.throws(()=>planAdditiveMigration({migration:{...migration,operations:[{type:'drop_table',table:'vc_vehicles'}]},observed:{}}),/UNSUPPORTED/);
 const adapter=createSheetsMigrationAdapter({openById(){return{getSheets(){return[]}}}},'fake-id');
 assert.deepEqual(adapter.inspect(),{});
 assert.throws(()=>adapter.apply(),/NOT_AUTHORIZED/);
});
