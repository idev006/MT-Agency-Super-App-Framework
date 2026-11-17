// Coordinator is deliberately dry-run only. A production executor requires reviewed storage adapter.
import {planAdditiveMigration} from './MigrationPlanner.js';
import {migrationExecutionReadiness} from './MigrationJournal.js';
export function createMigrationRunner(adapter){
 if(!adapter||typeof adapter.inspect!=='function') throw new Error('MIGRATION_ADAPTER_REQUIRED');
 return Object.freeze({
  dryRun(migration,applied=[]){return planAdditiveMigration({migration,observed:adapter.inspect(),applied});},
  assessReadiness(gates){return migrationExecutionReadiness(gates||{});},
  execute(){throw new Error('MIGRATION_EXECUTION_NOT_IMPLEMENTED');}
 });
}
