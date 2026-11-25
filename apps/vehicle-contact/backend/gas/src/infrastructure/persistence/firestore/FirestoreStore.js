import {DATABASE_SCHEMA} from '../../../domain/ports/SchemaRepository.js';

// Firestore adapter behind the SAME 8-method store port as SheetStore (D-E1 Option 2 / F2).
// table->collection, record->document (doc id = primary key), filter->equality where,
// list/listNewest->orderBy a persisted monotonic _seq + limit (Firestore has no implicit
// row order, so ordering is stored, not held in adapter memory). sequence() runs a REAL
// Firestore transaction (the ACID seam Sheets lacks); withLock is a no-op because every
// write is already atomic via its own transaction.
// The Firestore gateway is injected: the real REST + service-account-OAuth client
// (FirestoreRestGateway.js, F3a) in production, an in-memory fake in the offline contract
// test. This module uses no GAS- or Node-specific API, so it bundles unchanged into the
// GAS artifact; it is the only runtime store since Slice G (VC-ADR-026).
const SEQ_FIELD='_seq';
const MAX_LIMIT=5000;

export function createFirestoreStore({firestore}){
  if(!firestore)throw new Error('STORAGE_NOT_CONFIGURED');
  const columns=name=>{
    if(!Object.prototype.hasOwnProperty.call(DATABASE_SCHEMA.tables,name))throw new Error('UNKNOWN_TABLE');
    return DATABASE_SCHEMA.tables[name].columns;
  };
  const primaryKey=name=>columns(name).find(c=>c.key==='primary').name;
  const whereOf=filter=>Object.entries(filter||{}).map(([field,value])=>({field,value}));
  const checkLimit=limit=>{if(!Number.isSafeInteger(limit)||limit<1||limit>MAX_LIMIT)throw new Error('INVALID_LIMIT');};
  // Reads expose canonical columns only; the internal ordering field never leaks out.
  const strip=fields=>{const out={};for(const k of Object.keys(fields))if(k!==SEQ_FIELD)out[k]=fields[k];return out;};
  // W1a: _seq is a time-ordered integer (epoch-ms*1000 + per-execution counter), strictly
  // increasing within an execution and time-ordered across executions. It needs NO counter
  // read, so an insert is ONE commit. Values (~1.8e15) sort after every legacy counter value
  // (<1e6) and stay below 2^53. Ordering only — never used as an identity.
  let lastSeq=0;
  const nextSeq=()=>{lastSeq=Math.max(lastSeq+1,Date.now()*1000);return lastSeq;};
  const mapCommitError=e=>{
    if(e&&e.code==='ALREADY_EXISTS')return new Error('DUPLICATE_KEY');
    if(e&&e.code==='NOT_FOUND')return new Error('NOT_FOUND');
    if(e&&e.code==='FAILED_PRECONDITION')return new Error('WRITE_CONFLICT');
    return e;
  };
  const checkRequired=(cols,data)=>{for(const c of cols)if(c.required&&(data[c.name]===undefined||data[c.name]===''))throw new Error('REQUIRED_FIELD:'+c.name);};
  const checkPatch=(cols,patch)=>{if(!patch||!Object.keys(patch).length||Object.keys(patch).some(k=>!cols.some(c=>c.name===k)))throw new Error('INVALID_PATCH');};

  function build(gw){
    // Fast path only on the real REST gateway (has commit/batchGetMany). The tx object
    // passed by sequence() lacks them, so transactional callers keep the atomic tx path.
    const fast=typeof gw.commit==='function'&&typeof gw.batchGetMany==='function';
    const isPk=(name,filter)=>{const ks=Object.keys(filter||{});return ks.length===1&&ks[0]===primaryKey(name);};
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
      const cols=columns(name);checkRequired(cols,data);
      const docId=String(data[primaryKey(name)]);
      const doc={...data,[SEQ_FIELD]:nextSeq()};
      if(fast){
        // ONE round: create with exists:false — the server rejects a duplicate key atomically.
        try{gw.commit([{type:'create',coll:name,id:docId,fields:doc}]);}catch(e){throw mapCommitError(e);}
        return {...data};
      }
      return gw.runTransaction(tx=>{
        if(tx.get(name,docId))throw new Error('DUPLICATE_KEY');
        tx.create(name,docId,doc);
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
    // W1b building block: several writes in ONE commit — Firestore applies a commit
    // all-or-nothing, with per-write preconditions (create: must not exist; patch/delete:
    // must exist). No locks, no transaction. ops: [{op:'insert',table,data} |
    // {op:'update',table,key:{pk:value},fields} | {op:'remove',table,key:{pk:value}}].
    function writeMany(ops){
      const writes=ops.map(o=>{
        const cols=columns(o.table);
        if(o.op==='insert'){checkRequired(cols,o.data);
          return {type:'create',coll:o.table,id:String(o.data[primaryKey(o.table)]),fields:{...o.data,[SEQ_FIELD]:nextSeq()}};}
        if(!isPk(o.table,o.key))throw new Error('WRITE_REQUIRES_PRIMARY_KEY');
        const id=String(o.key[primaryKey(o.table)]);
        if(o.op==='update'){checkPatch(cols,o.fields);return {type:'patch',coll:o.table,id,fields:o.fields,...(o.ifVersion?{ifUpdateTime:o.ifVersion}:{})};}
        if(o.op==='remove')return {type:'delete',coll:o.table,id};
        throw new Error('INVALID_WRITE');
      });
      if(!writes.length)return true;
      // Firestore rejects two writes to the same document in one commit (INVALID_ARGUMENT).
      const targets=new Set(writes.map(w=>w.coll+'/'+w.id));
      if(targets.size!==writes.length)throw new Error('DUPLICATE_WRITE_TARGET');
      if(fast){try{gw.commit(writes);}catch(e){throw mapCommitError(e);}return true;}
      for(const o of ops){
        if(o.op==='insert')insert(o.table,o.data);
        else if(o.op==='update')update(o.table,o.key,o.fields);
        else remove(o.table,o.key);
      }
      return true;
    }
    // Optional port extensions (Sheets and the in-tx store degrade to the sequential port).
    // readMany: independent one/list reads in ONE parallel round. reqs: [{kind:'one'|'list',name,filter}].
    // opts.inserts: append-only rows ([[table,data],...]) written in the SAME parallel round as the
    // reads (create, exists:false → atomic, duplicate-safe). Falls back to insert-then-read.
    function readMany(reqs,opts={}){
      const inserts=Array.isArray(opts.inserts)?opts.inserts:[];
      if(inserts.length&&!(fast&&typeof gw.queryManyAndCommit==='function')){
        for(const [table,data] of inserts)insert(table,data);
        return readMany(reqs);
      }
      if(typeof gw.queryMany!=='function')
        return reqs.map(r=>r.kind==='one'?one(r.name,r.filter):r.kind==='versioned'?{row:one(r.name,r.filter),version:null}
          :r.kind==='newest'?listNewest(r.name,r.filter,r.limit||1):r.kind==='count'?count(r.name,r.filter):list(r.name,r.filter,r.limit||MAX_LIMIT));
      const specs=reqs.map(r=>{
        columns(r.name);
        if(r.kind==='one'||r.kind==='versioned')return {coll:r.name,where:whereOf(r.filter)};
        if(r.kind==='list'){const l=r.limit||MAX_LIMIT;checkLimit(l);return {coll:r.name,where:whereOf(r.filter),orderBy:{field:SEQ_FIELD,direction:'asc'},limit:l};}
        // TUNEUP R1: COUNT aggregation — a number, never the documents.
        if(r.kind==='count')return {coll:r.name,where:whereOf(r.filter),count:true};
        // newest-first window — reuses the existing DESC composite indexes (listNewest).
        if(r.kind==='newest'){const l=r.limit||1;checkLimit(l);return {coll:r.name,where:whereOf(r.filter),orderBy:{field:SEQ_FIELD,direction:'desc'},limit:l};}
        throw new Error('INVALID_READ');
      });
      let results;
      if(inserts.length){
        const ops=inserts.map(([table,data])=>{const cols=columns(table);checkRequired(cols,data);
          return {type:'create',coll:table,id:String(data[primaryKey(table)]),fields:{...data,[SEQ_FIELD]:nextSeq()}};});
        let out;try{out=gw.queryManyAndCommit(specs,ops);}catch(e){throw mapCommitError(e);}
        results=out.slice(0,specs.length);
      }else results=gw.queryMany(specs);
      return results.map((hits,i)=>{
        // a gateway without aggregation answers a count spec with the matching rows
        if(reqs[i].kind==='count')return typeof hits==='number'?hits:hits.length;
        if(reqs[i].kind==='list'||reqs[i].kind==='newest')return hits.map(d=>strip(d.fields));
        if(hits.length>1)throw new Error('DUPLICATE_KEY');
        if(reqs[i].kind==='versioned')return hits.length?{row:strip(hits[0].fields),version:hits[0].updateTime||null}:{row:null,version:null};
        return hits.length?strip(hits[0].fields):null;
      });
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
    return Object.freeze({one,list,listNewest,count,insert,update,remove,withLock,sequence,readMany,patch,writeMany});
  }
  return build(firestore);
}