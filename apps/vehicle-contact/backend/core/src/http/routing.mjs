// Which engine answers each operation (VC-ADR-046). The core answers the operations its facade has a flow for
// (facade/operations.mjs FLOWS — one list); everything else goes to the legacy engine. Rollback of a group = remove its
// flows from that list. GET is health only and always goes to the legacy (its version is what the deploy smoke checks).
export function createRouter({legacy, core = null}) {
  const ported = new Set(core ? core.operations : []);
  return {
    engineFor: op => (ported.has(op) ? 'core' : 'legacy'),
    async dispatch(envelope, method = 'POST') {
      const op = envelope && typeof envelope === 'object' ? envelope.group + '.' + envelope.action : '';
      if (method === 'POST' && ported.has(op)) return core.dispatch(envelope, method);
      return legacy.dispatch(envelope, method);
    }
  };
}
