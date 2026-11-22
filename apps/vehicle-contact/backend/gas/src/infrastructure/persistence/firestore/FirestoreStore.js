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
// GAS artifact; the composition root selects it only when VEHICLE_PERSISTENCE_BACKEND
// =firestore (default stays Sheets).
const SEQ_COLLECTION='__p6vc_seq';
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

  function build(gw){
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
    function insert(name,data){
      const cols=columns(name);
      for(const c of cols)if(c.required&&(data[c.name]===undefined||data[c.name]===''))throw new Error('REQUIRED_FIELD:'+c.name);
      const docId=String(data[primaryKey(name)]);
      return gw.runTransaction(tx=>{
        if(tx.get(name,docId))throw new Error('DUPLICATE_KEY');
        const counter=tx.get(SEQ_COLLECTION,name);
        const next=((counter&&counter.value)||0)+1;
        tx.create(name,docId,{...data,[SEQ_FIELD]:next});
        if(counter)tx.update(SEQ_COLLECTION,name,{value:next});
        else tx.create(SEQ_COLLECTION,name,{value:next});
        return {...data};
      });
    }
    function update(name,filter,patch){
      const cols=columns(name);
      if(!patch||Object.keys(patch).some(k=>!cols.some(c=>c.name===k)))throw new Error('INVALID_PATCH');
      const hits=gw.query(name,{where:whereOf(filter)});
      if(hits.length!==1)throw new Error(hits.length?'DUPLICATE_KEY':'NOT_FOUND');
      const id=hits[0].id;
      return gw.runTransaction(tx=>{
        const current=tx.get(name,id);
        if(!current)throw new Error('NOT_FOUND');
        tx.update(name,id,patch);
        return strip({...current,...patch});
      });
    }
    function remove(name,filter){
      columns(name);
      const hits=gw.query(name,{where:whereOf(filter)});
      if(hits.length!==1)throw new Error(hits.length?'DUPLICATE_KEY':'NOT_FOUND');
      const id=hits[0].id;
      return gw.runTransaction(tx=>{
        if(!tx.get(name,id))throw new Error('NOT_FOUND');
        tx.delete(name,id);
        return true;
      });
    }
    function withLock(fn){return fn();}
    function sequence(fn){return gw.runTransaction(tx=>fn(build(tx)));}
    return Object.freeze({one,list,listNewest,insert,update,remove,withLock,sequence});
  }
  return build(firestore);
}