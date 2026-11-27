// Adapter-agnostic contract for the persistence "black box" (store port).
// The runtime API (55 ops) depends ONLY on these 8 methods, injected at the
// composition root. Any adapter — Sheets, in-memory, Firestore — MUST satisfy
// this identical suite so the engine is swappable without touching use-cases.
// D-E1 Option 2 (owner-ratified 2026-11-22): keep the Sheets adapter, add a
// Firestore adapter behind the same port. See E1_INDEXED_DATASTORE_MIGRATION_DESIGN.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';
import {runStorePortContract} from './support/store-port-contract.mjs';
export {runStorePortContract};

// The Sheets adapter was removed in S1 (VC-ADR-029); Firestore adapters run this contract
// in firestore-store-contract / firestore-store-rest-contract.
// Subject 2: an in-memory reference adapter (same shape the acceptance harness
// uses to run the full real API without Sheets). Proves the port is store-agnostic.
function makeMemoryStore(){
  const tables=new Map(Object.keys(DATABASE_SCHEMA.tables).map(t=>[t,[]]));
  const cols=t=>DATABASE_SCHEMA.tables[t].columns;
  const data=t=>{if(!tables.has(t))throw Error('UNKNOWN_TABLE:'+t);return tables.get(t);};
  const where=(r,f)=>Object.entries(f||{}).every(([k,v])=>r[k]===v);
  const copy=x=>structuredClone(x);
  const lim=l=>{if(!Number.isSafeInteger(l)||l<1||l>5000)throw Error('INVALID_LIMIT');};
  return{
    one(t,f){const h=data(t).filter(x=>where(x,f));if(h.length>1)throw Error('DUPLICATE_KEY');return h.length?copy(h[0]):null;},
    list(t,f={},l=5000){lim(l);return copy(data(t).filter(x=>where(x,f)).slice(0,l));},
    listNewest(t,f={},l=5000){lim(l);return copy(data(t).filter(x=>where(x,f)).slice(-l));},
    insert(t,r){const cs=cols(t);for(const k of cs)if(k.required&&(r[k.name]===undefined||r[k.name]===''))throw Error('REQUIRED_FIELD:'+k.name);
      const key=cs.find(k=>k.key==='primary')?.name;if(key&&data(t).some(x=>x[key]===r[key]))throw Error('DUPLICATE_KEY');
      data(t).push(copy(r));return copy(r);},
    update(t,f,p){if(Object.keys(p||{}).some(k=>!cols(t).some(c=>c.name===k)))throw Error('INVALID_PATCH');
      const h=data(t).filter(x=>where(x,f));if(h.length!==1)throw Error(h.length?'DUPLICATE_KEY':'NOT_FOUND');
      Object.assign(h[0],copy(p));return copy(h[0]);},
    remove(t,f){const h=data(t).filter(x=>where(x,f));if(h.length!==1)throw Error(h.length?'DUPLICATE_KEY':'NOT_FOUND');
      data(t).splice(data(t).indexOf(h[0]),1);return true;},
    withLock(fn){return fn();},
    sequence(fn){return fn();}
  };
}


test('in-memory reference adapter satisfies the same store port contract',()=>runStorePortContract(assert,makeMemoryStore()));