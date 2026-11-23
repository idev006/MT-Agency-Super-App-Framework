// Latency quantiles + budget guard for the live suite (G2).
// Method: ascending sort; q-quantile = floor(q*n)-th value (0-indexed, clamped).
// Budgets are RECORDED MEASUREMENTS (latency-baseline.json), not invented targets;
// WARN when p95 exceeds baseline by >25%. Hard FAIL only after an owner production budget.
export function computeLatency(tests, baseline, {warnFactor = 1.25} = {}) {
  const rows = (tests || []).filter(t => typeof t.durationMs === 'number');
  const ds = rows.map(t => t.durationMs).sort((a, b) => a - b);
  if (!ds.length) return {n: 0, reason: 'NO_DURATION_SAMPLES'};
  const q = p => ds[Math.min(Math.floor(p * ds.length), ds.length - 1)];
  const out = {
    n: ds.length,
    method: 'floor(q*n)-th of ascending durations (0-indexed)',
    p50: q(0.5), p90: q(0.9), p95: q(0.95), max: ds[ds.length - 1],
    slowest: [...rows].sort((a, b) => b.durationMs - a.durationMs).slice(0, 5)
      .map(t => ({id: t.id, ms: t.durationMs})),
  };
  if (baseline && typeof baseline.p95 === 'number') {
    out.baseline = baseline;
    out.p95DeltaPct = Math.round(((out.p95 - baseline.p95) / baseline.p95) * 1000) / 10;
    out.budget = out.p95 > baseline.p95 * warnFactor ? 'WARN' : 'OK';
  }
  return out;
}