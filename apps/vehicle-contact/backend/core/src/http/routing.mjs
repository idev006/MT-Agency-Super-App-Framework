// Which engine answers each operation (VC-ADR-046). One table, one place: an operation group moves to the core by adding
// its handlers here in the PR that ports it; rollback = remove them (the legacy answers again).
// Phase 1: empty — every operation is forwarded to the legacy engine.
export const CORE_HANDLERS = Object.freeze({
  // 'vehicles.lookup': async (payload, principal, ctx) => ...   (phase 2)
});

export function createRouter({legacy, handlers = CORE_HANDLERS}) {
  return {
    engineFor: op => (Object.prototype.hasOwnProperty.call(handlers, op) ? 'core' : 'legacy'),
    async dispatch(envelope, method = 'POST') {
      const op = envelope && typeof envelope === 'object' ? envelope.group + '.' + envelope.action : '';
      if (method === 'POST' && Object.prototype.hasOwnProperty.call(handlers, op)) return handlers[op](envelope);
      return legacy.dispatch(envelope, method);
    }
  };
}
