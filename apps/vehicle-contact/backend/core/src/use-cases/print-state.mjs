// VC-ADR-042 QR print state on the core's async store (VC-ADR-051 N1a): every new ACTIVE QR puts its vehicle back to
// NOT_PRINTED, and a new vehicle row starts NOT_PRINTED — on every write path (insert / writeMany / readMany inserts /
// sequence), so no use case knows about it. The rule itself is the legacy engine's (VehicleListOperations.js); only the
// awaiting is new.
import {isNewQr, printStateRow, printStateOps, printStateResetOp} from '../../../gas/src/application/use-cases/VehicleListOperations.js';

export function withPrintState(store) {
  const wrap = s => {
    const out = {...s};
    out.insert = async (table, data) => {
      const r = await s.insert(table, printStateRow(table, data));
      if (isNewQr(table, data)) { const o = printStateResetOp(data.vehicle_id); await s.update(o.table, o.key, o.fields); }
      return r;
    };
    if (typeof s.writeMany === 'function') out.writeMany = ops => s.writeMany(printStateOps(ops));
    if (typeof s.readMany === 'function') out.readMany = (reqs, opts = {}) => {
      if (!Array.isArray(opts.inserts) || !opts.inserts.length) return s.readMany(reqs, opts);
      // a QR inserted alongside reads is not a write path any flow uses; refuse rather than skip the rule silently
      if (opts.inserts.some(([t, d]) => isNewQr(t, d))) throw new Error('PRINT_STATE_UNSUPPORTED_WRITE');
      return s.readMany(reqs, {...opts, inserts: opts.inserts.map(([t, d]) => [t, printStateRow(t, d)])});
    };
    if (typeof s.sequence === 'function') out.sequence = fn => s.sequence(tx => fn(tx && typeof tx === 'object' ? wrap(tx) : tx));
    return Object.freeze(out);
  };
  return wrap(store);
}
