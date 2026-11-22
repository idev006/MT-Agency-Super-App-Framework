// F3b-2 backfill engine (E1 design §5.4): checksum-verified import of a canonical Sheets
// snapshot into Firestore, in PRIMARY ROW ORDER (_seq = index+1), followed by an
// INDEPENDENT read-back audit (owner directive: API OK != data proof). The injected `db`
// is the Node SDK Firestore in the gated live runner (independent of the GAS REST gateway)
// or a contract-faithful fake offline. audit mode never writes.
// Divergence repair: backfill overwrites snapshot rows, deletes extras, and resets the
// __p6vc_seq counter so dual-write ordering parity is restored. Run in a quiesced window.
import {createHash} from 'node:crypto';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';

const SEQ_COLLECTION='__p6vc_seq';
const SEQ_FIELD='_seq';
const BATCH_LIMIT=500;

const canonicalRow=row=>JSON.stringify(Object.fromEntries(Object.keys(row).sort().map(k=>[k,row[k]])));
export function checksumRows(rows,pk){
  const sorted=rows.slice().sort((a,b)=>String(a[pk]).localeCompare(String(b[pk])));
  return createHash('sha256').update(sorted.map(canonicalRow).join('\n')).digest('hex');
}
const stripSeq=data=>{const out={};for(const k of Object.keys(data))if(k!==SEQ_FIELD)out[k]=data[k];return out;};

function validateSnapshot(snapshot){
  if(!snapshot||typeof snapshot!=='object'||!snapshot.tables)throw new Error('BACKFILL_INVALID_SNAPSHOT:tables');
  if(snapshot.marker!=='SYNTHETIC_DEV_BACKFILL')throw new Error('BACKFILL_INVALID_SNAPSHOT:MARKER');
  for(const [name,rows] of Object.entries(snapshot.tables)){
    const def=DATABASE_SCHEMA.tables[name];
    if(!def)throw new Error('BACKFILL_INVALID_SNAPSHOT:UNKNOWN_TABLE:'+name);
    if(!Array.isArray(rows))throw new Error('BACKFILL_INVALID_SNAPSHOT:ROWS:'+name);
    const pk=def.columns.find(c=>c.key==='primary').name;
    const seen=new Set();
    for(const row of rows){
      const id=row[pk];
      if(typeof id!=='string'||!id)throw new Error('BACKFILL_INVALID_SNAPSHOT:PRIMARY_KEY:'+name);
      if(seen.has(id))throw new Error('BACKFILL_INVALID_SNAPSHOT:DUPLICATE_KEY:'+name+':'+id);
      seen.add(id);
      for(const c of def.columns)if(c.required&&(row[c.name]===undefined||row[c.name]===''))
        throw new Error('BACKFILL_INVALID_SNAPSHOT:REQUIRED_FIELD:'+name+':'+c.name);
    }
  }
}

export async function runBackfill({db,snapshot,mode='backfill'}){
  if(mode!=='backfill'&&mode!=='audit')throw new Error('BACKFILL_INVALID_MODE:'+mode);
  validateSnapshot(snapshot);
  const report={mode,startedAt:new Date().toISOString(),tables:[],status:'PASS'};
  for(const [name,rows] of Object.entries(snapshot.tables)){
    const pk=DATABASE_SCHEMA.tables[name].columns.find(c=>c.key==='primary').name;
    const sourceChecksum=checksumRows(rows,pk);
    const entry={table:name,rows:rows.length,sourceChecksum,readBackChecksum:null,match:false,extras:[],missing:[],seqParity:false};
    const coll=db.collection(name);
    if(mode==='backfill'){
      const existing=await coll.get();
      const wanted=new Set(rows.map(r=>String(r[pk])));
      const ops=[];
      rows.forEach((row,i)=>ops.push({type:'set',ref:coll.doc(String(row[pk])),data:{...row,[SEQ_FIELD]:i+1}}));
      for(const doc of existing.docs)if(!wanted.has(doc.id))ops.push({type:'delete',ref:coll.doc(doc.id)});
      ops.push({type:'set',ref:db.collection(SEQ_COLLECTION).doc(name),data:{value:rows.length}});
      for(let i=0;i<ops.length;i+=BATCH_LIMIT){
        const batch=db.batch();
        for(const op of ops.slice(i,i+BATCH_LIMIT))op.type==='set'?batch.set(op.ref,op.data):batch.delete(op.ref);
        await batch.commit();
      }
    }
    // Independent read-back: re-read everything from the store, never trust write results.
    const readBack=await coll.get();
    const byId=new Map(readBack.docs.map(d=>[d.id,stripSeq(d.data())]));
    entry.readBackChecksum=checksumRows([...byId.values()],pk);
    entry.missing=rows.map(r=>String(r[pk])).filter(id=>!byId.has(id));
    entry.extras=[...byId.keys()].filter(id=>!rows.some(r=>String(r[pk])===id));
    entry.match=entry.readBackChecksum===sourceChecksum&&entry.missing.length===0&&entry.extras.length===0
      &&rows.every(r=>{const got=byId.get(String(r[pk]));return got&&canonicalRow(got)===canonicalRow(r);});
    const ordered=readBack.docs.slice().sort((a,b)=>(a.data()[SEQ_FIELD]||0)-(b.data()[SEQ_FIELD]||0)).map(d=>d.id);
    entry.seqParity=mode==='audit'?null:JSON.stringify(ordered)===JSON.stringify(rows.map(r=>String(r[pk])));
    if(!entry.match||entry.seqParity===false)report.status='FAIL';
    report.tables.push(entry);
  }
  const journal=snapshot.tables.vc_operation_journal||[];
  report.divergenceOpen=journal.filter(r=>r.operation==='dualwrite.divergence'&&r.status==='OPEN').length;
  report.finishedAt=new Date().toISOString();
  return report;
}