import {createFirestoreRules, SEQ_FIELD, TTL_FIELD, TTL_RULES, MAX_LIMIT} from './FirestoreRules.js';
export {TTL_FIELD, TTL_RULES};

// Firestore adapter behind the 8-method store port (D-E1 Option 2 / F2) — the SYNCHRONOUS store of the legacy engine.
// The storage rules (doc id = primary key, equality where, persisted _seq order, TTL, checks, error mapping, readMany
// specs) live in FirestoreRules.js, shared with the Node core's asynchronous store (VC-ADR-046 phase 2b).
// sequence() runs a REAL Firestore transaction; withLock is a no-op because every write is already atomic.
// The gateway is injected: the REST + service-account-OAuth client (FirestoreRestGateway.js) in production, an in-memory
// fake in the offline contract test. No GAS- or Node-specific API here, so it bundles unchanged into the GAS artifact.
export function createFirestoreStore({firestore}){
  if(!firestore)throw new Error('STORAGE_NOT_CONFIGURED');
  const R=createFirestoreRules();
  const {columns,primaryKey,whereOf,checkLimit,strip,mapCommitError,checkPatch,isPk}=R;

  function build(gw){
    // Fast path only on the real REST gateway (has commit/batchGetMany). The tx object
    // passed by sequence() lacks them, so transactional callers keep the atomic tx path.
    const fast=typeof gw.commit==='function'&&typeof gw.batchGetMany==='function';
    function one(name,filter){
      columns(name);
      const hits=gw.query(name,{where:whereOf(filter)});
      if(hits.length>1)throw new Error('DUPLICATE_KEY');
      return hits.length?strip(hits[0].fields):null;
    }
    function list(name,filter={},limit=MAX_LIMIT){
      columns(name);checkLimit(limit);
      return gw.query(name,{where:whereOf(filter),orderBy:{field:SEQ_FIELD,direction:'asc'},limit}).map(d=>strip(d.fields));
    }
    function listNewest(name,filter={},limit=MAX_LIMIT){
      columns(name);checkLimit(limit);
      return gw.query(name,{where:whereOf(filter),orderBy:{field:SEQ_FIELD,direction:'desc'},limit}).map(d=>strip(d.fields));
    }
    // TUNEUP R1: COUNT aggregation when the gateway has it (1 read per 1,000 entries); else rows.
    function count(name,filter={}){
      columns(name);
      if(typeof gw.count==='function')return gw.count(name,{where:whereOf(filter)});
      return gw.query(name,{where:whereOf(filter)}).length;
    }
    function insert(name,data){
      const w=R.createWrite(name,data);
      if(fast){
        // ONE round: create with exists:false — the server rejects a duplicate key atomically.
        try{gw.commit([w]);}catch(e){throw mapCommitError(e);}
        return {...data};
      }
      return gw.runTransaction(tx=>{
        if(tx.get(name,w.id))throw new Error('DUPLICATE_KEY');
        tx.create(name,w.id,w.fields);
        return {...data};
      });
    }
    // Resolve a filter to one document id: PK → no read; otherwise one query (must match 1).
    function resolveId(name,filter){
      if(isPk(name,filter))return String(filter[primaryKey(name)]);
      const hits=gw.query(name,{where:whereOf(filter)});
      if(hits.length!==1)throw new Error(hits.length?'DUPLICATE_KEY':'NOT_FOUND');
      return hits[0].id;
    }
    function update(name,filter,fields){
      checkPatch(columns(name),fields);
      if(fast){
        // Field-masked write (exists:true): touches ONLY the patched fields, so concurrent
        // writers to other fields are never overwritten. By PK = ONE round.
        const id=resolveId(name,filter);
        try{gw.commit([{type:'patch',coll:name,id,fields}]);}catch(e){throw mapCommitError(e);}
        return strip({...filter,...fields});
      }
      const hits=gw.query(name,{where:whereOf(filter)});
      if(hits.length!==1)throw new Error(hits.length?'DUPLICATE_KEY':'NOT_FOUND');
      const id=hits[0].id;
      return gw.runTransaction(tx=>{
        const current=tx.get(name,id);
        if(!current)throw new Error('NOT_FOUND');
        tx.update(name,id,fields);
        return strip({...current,...fields});
      });
    }
    function remove(name,filter){
      columns(name);
      if(fast){
        const id=resolveId(name,filter);
        try{gw.commit([{type:'delete',coll:name,id}]);}catch(e){throw mapCommitError(e);}
        return true;
      }
      const hits=gw.query(name,{where:whereOf(filter)});
      if(hits.length!==1)throw new Error(hits.length?'DUPLICATE_KEY':'NOT_FOUND');
      const id=hits[0].id;
      return gw.runTransaction(tx=>{
        if(!tx.get(name,id))throw new Error('NOT_FOUND');
        tx.delete(name,id);
        return true;
      });
    }
    // W1b: several writes in ONE commit — all-or-nothing with per-write preconditions (create: must not exist;
    // patch/delete: must exist). ops: [{op:'insert',table,data} | {op:'update',table,key,fields} | {op:'remove',table,key}].
    function writeMany(ops){
      const writes=ops.map(R.manyWrite);
      if(!writes.length)return true;
      R.checkDistinctTargets(writes); // Firestore rejects two writes to the same document in one commit
      if(fast){try{gw.commit(writes);}catch(e){throw mapCommitError(e);}return true;}
      for(const o of ops){
        if(o.op==='insert')insert(o.table,o.data);
        else if(o.op==='update')update(o.table,o.key,o.fields);
        else remove(o.table,o.key);
      }
      return true;
    }
    // readMany: independent reads in ONE parallel round. reqs: [{kind:'one'|'list'|'newest'|'count'|'versioned',name,filter}].
    // opts.inserts: append-only rows ([[table,data],...]) written in the SAME round (create, exists:false). Falls back to
    // insert-then-read where the gateway cannot do both at once.
    function readMany(reqs,opts={}){
      const inserts=Array.isArray(opts.inserts)?opts.inserts:[];
      if(inserts.length&&!(fast&&typeof gw.queryManyAndCommit==='function')){
        for(const [table,data] of inserts)insert(table,data);
        return readMany(reqs);
      }
      if(typeof gw.queryMany!=='function')
        return reqs.map(r=>r.kind==='one'?one(r.name,r.filter):r.kind==='versioned'?{row:one(r.name,r.filter),version:null}
          :r.kind==='newest'?listNewest(r.name,r.filter,r.limit||1):r.kind==='count'?count(r.name,r.filter):list(r.name,r.filter,r.limit||MAX_LIMIT));
      const specs=reqs.map(R.readSpec);
      let results;
      if(inserts.length){
        const ops=inserts.map(([table,data])=>R.createWrite(table,data));
        let out;try{out=gw.queryManyAndCommit(specs,ops);}catch(e){throw mapCommitError(e);}
        results=out.slice(0,specs.length);
      }else results=gw.queryMany(specs);
      return results.map((hits,i)=>R.readResult(reqs[i],hits));
    }
    // patch: blind field-masked write by primary key — 1 round-trip, touches ONLY the
    // patched fields, so it can never resurrect a concurrently revoked/changed record.
    function patch(name,filter,fields){
      const cols=columns(name);
      if(!fields||!Object.keys(fields).length||Object.keys(fields).some(k=>!cols.some(c=>c.name===k)))throw new Error('INVALID_PATCH');
      if(!isPk(name,filter))throw new Error('PATCH_REQUIRES_PRIMARY_KEY');
      if(!fast){update(name,filter,fields);return true;}
      try{gw.commit([{type:'patch',coll:name,id:String(filter[primaryKey(name)]),fields}]);}
      catch(e){if(e&&e.code==='NOT_FOUND')throw new Error('NOT_FOUND');throw e;}
      return true;
    }
    function withLock(fn){return fn();}
    function sequence(fn){return gw.runTransaction(tx=>fn(build(tx)));}
    return Object.freeze({one,list,listNewest,count,insert,update,remove,withLock,sequence,readMany,patch,writeMany,supportsTtl:true});
  }
  return build(firestore);
}
