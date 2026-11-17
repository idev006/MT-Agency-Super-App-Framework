// Pure, deterministic, additive-only migration planning. Never writes to a spreadsheet.
export function planAdditiveMigration({migration,observed,applied=[]}) {
 if(!migration||!/^VC_[0-9]{4}_[A-Z0-9_]+$/.test(migration.id)||!Array.isArray(migration.operations)) throw new Error('INVALID_MIGRATION');
 if(!observed||typeof observed!=='object'||Array.isArray(observed)) throw new Error('INVALID_OBSERVED_SCHEMA');
 if(applied.some(a=>a.id===migration.id)) {
   const entry=applied.find(a=>a.id===migration.id);
   if(entry.checksum!==migration.checksum) throw new Error('MIGRATION_CHECKSUM_MISMATCH');
   if(entry.status!=='APPLIED') throw new Error('MIGRATION_NOT_COMPLETE');
   return {migrationId:migration.id,status:'ALREADY_APPLIED',operations:[]};
 }
 const operations=[];
 for(const op of migration.operations){
   if(op.type==='create_table'){
     if(!/^vc_[a-z0-9_]+$/.test(op.table)||!Array.isArray(op.columns)||!op.columns.length||new Set(op.columns).size!==op.columns.length||op.columns.some(c=>!/^[a-z][a-z0-9_]*$/.test(c))) throw new Error('INVALID_TABLE_DEFINITION');
     if(Object.hasOwn(observed,op.table)){
       if(JSON.stringify(observed[op.table])!==JSON.stringify(op.columns)) throw new Error('EXISTING_TABLE_DRIFT');
       operations.push({type:'verify_existing_table',table:op.table});
     }else operations.push({type:'create_table',table:op.table,columns:[...op.columns]});
   }else if(op.type==='add_column'){
     if(!Object.hasOwn(observed,op.table)||!/^[a-z][a-z0-9_]*$/.test(op.column)) throw new Error('INVALID_ADD_COLUMN');
     if(observed[op.table].includes(op.column)) operations.push({type:'verify_existing_column',table:op.table,column:op.column});
     else operations.push({type:'add_column',table:op.table,column:op.column});
   }else throw new Error('UNSUPPORTED_MIGRATION_OPERATION');
 }
 return {migrationId:migration.id,status:'DRY_RUN',operations};
}
