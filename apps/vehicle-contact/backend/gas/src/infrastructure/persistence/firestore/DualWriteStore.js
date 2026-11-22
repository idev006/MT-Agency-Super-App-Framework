import {DATABASE_SCHEMA} from '../../../domain/ports/SchemaRepository.js';

// F3b dual-write phase (E1 design §5.3): Sheets stays system of record (primary); every
// write is mirrored best-effort to the Firestore shadow (secondary). Divergence is journaled
// (vc_operation_journal, operation=dualwrite.divergence) and repaired by the checksum
// backfill/read-back audit before cutover — the audit is the safety net even if journaling
// itself fails. Reads never touch the shadow. sequence() replays the captured write log to
// the shadow AFTER the primary transaction commits; a primary throw mirrors nothing.
// Cross-store atomicity is intentionally NOT claimed: dual-write + reconcile precedes cutover.
export function createDualWriteStore({primary,secondary,journal,clock}){
  if(!primary||!secondary||!journal)throw new Error('DUALWRITE_NOT_CONFIGURED');
  const primaryKey=name=>{
    const t=DATABASE_SCHEMA.tables[name];
    if(!t)throw new Error('UNKNOWN_TABLE');
    return t.columns.find(c=>c.key==='primary').name;
  };
  const entityOf=(op,args)=>{
    if(op==='insert')return args[0]+':'+String(args[1][primaryKey(args[0])]);
    return args[0]+':'+JSON.stringify(args[1]);
  };
  function mirror(op,args){
    try{secondary[op](...args);}
    catch(e){
      try{
        journal.record({operation:'dualwrite.divergence',entity_id:entityOf(op,args),status:'OPEN',
          detail_json:JSON.stringify({op,args,error:String(e&&e.message||e).slice(0,200)}),created_at:clock()});
      }catch(_){/* audit backstop: backfill read-back compare still detects divergence */}
    }
  }
  // SheetStore.sequence calls fn() with NO tx argument; FirestoreStore passes a tx-scoped
  // store. Fall back to primary so reads/writes inside fn work for both engines.
  function capturing(tx,log){
    const base=tx||primary;
    return Object.freeze({
      one:(...a)=>base.one(...a),
      list:(...a)=>base.list(...a),
      listNewest:(...a)=>base.listNewest(...a),
      withLock:fn=>base.withLock(fn),
      insert:(...a)=>{const r=base.insert(...a);log.push(['insert',a]);return r;},
      update:(...a)=>{const r=base.update(...a);log.push(['update',a]);return r;},
      remove:(...a)=>{const r=base.remove(...a);log.push(['remove',a]);return r;},
      sequence:fn=>base.sequence(ntx=>fn(capturing(ntx,log)))
    });
  }
  return Object.freeze({
    one:(...a)=>primary.one(...a),
    list:(...a)=>primary.list(...a),
    listNewest:(...a)=>primary.listNewest(...a),
    withLock:fn=>primary.withLock(fn),
    insert(...a){const r=primary.insert(...a);mirror('insert',a);return r;},
    update(...a){const r=primary.update(...a);mirror('update',a);return r;},
    remove(...a){const r=primary.remove(...a);mirror('remove',a);return r;},
    sequence(fn){
      const log=[];
      const result=primary.sequence(tx=>fn(capturing(tx,log)));
      for(const [op,args] of log)mirror(op,args);
      return result;
    }
  });
}