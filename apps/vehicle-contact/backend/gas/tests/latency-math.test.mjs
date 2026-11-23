import test from 'node:test';
import assert from 'node:assert/strict';
import {computeLatency} from '../scripts/latency-math.mjs';

const sample=durations=>durations.map((ms,i)=>({id:'T'+i,durationMs:ms}));

test('quantiles use floor(q*n)-th of ascending durations (0-indexed)',()=>{
 const out=computeLatency(sample([300,100,200,500,400,900,700,800,600,1000]));
 assert.equal(out.n,10);
 assert.equal(out.p50,600);
 assert.equal(out.p90,1000);
 assert.equal(out.p95,1000);
 assert.equal(out.max,1000);
 assert.deepEqual(out.slowest[0],{id:'T9',ms:1000});
 assert.equal(out.slowest.length,5);
});

test('single sample and clamped quantile index',()=>{
 const out=computeLatency(sample([42]));
 assert.equal(out.p50,42);assert.equal(out.p95,42);assert.equal(out.max,42);
});

test('empty or non-numeric input yields NO_DURATION_SAMPLES',()=>{
 assert.deepEqual(computeLatency([]),{n:0,reason:'NO_DURATION_SAMPLES'});
 assert.deepEqual(computeLatency(undefined),{n:0,reason:'NO_DURATION_SAMPLES'});
 assert.deepEqual(computeLatency([{id:'x'}]),{n:0,reason:'NO_DURATION_SAMPLES'});
});

test('budget WARN only above baseline p95 * 1.25, OK at the boundary',()=>{
 const baseline={p95:1000};
 const at=computeLatency(sample([1250]),baseline);
 assert.equal(at.budget,'OK');
 assert.equal(at.p95DeltaPct,25);
 const above=computeLatency(sample([1251]),baseline);
 assert.equal(above.budget,'WARN');
 assert.equal(above.p95DeltaPct,25.1);
 const faster=computeLatency(sample([800]),baseline);
 assert.equal(faster.budget,'OK');
 assert.equal(faster.p95DeltaPct,-20);
});

test('custom warnFactor respected; no baseline means no budget field',()=>{
 assert.equal(computeLatency(sample([1100]),{p95:1000},{warnFactor:1.1}).budget,'OK');
 assert.equal(computeLatency(sample([1101]),{p95:1000},{warnFactor:1.1}).budget,'WARN');
 const out=computeLatency(sample([100]));
 assert.equal(out.budget,undefined);
 assert.equal(out.baseline,undefined);
});