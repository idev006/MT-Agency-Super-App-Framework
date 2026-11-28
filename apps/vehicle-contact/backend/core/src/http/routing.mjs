// Which engine answers each operation. Since backend 0.9.73 the core is the only backend (p6vc-api retired, owner
// 2026-11-28): the core answers every operation its facade lists (FLOWS + USE_CASES + system.health). A legacy engine is
// used only when one is passed in (the L1 dev server answers in-process); without one, EVERY request goes to the core
// facade, which runs the router checks first (a malformed request → BAD_REQUEST, live test LIVE-06) and answers an
// operation it does not have with NOT_FOUND — nothing is forwarded over the network any more.
export function createRouter({legacy = null, core = null}) {
  const ported = new Set(core ? core.operations : []);
  return {
    engineFor: op => (ported.has(op) || !legacy ? 'core' : 'legacy'),
    async dispatch(envelope, method = 'POST') {
      const op = envelope && typeof envelope === 'object' ? envelope.group + '.' + envelope.action : '';
      if ((method === 'POST' || op === 'system.health') && ported.has(op)) return core.dispatch(envelope, method);
      return legacy ? legacy.dispatch(envelope, method) : core.dispatch(envelope, method);
    }
  };
}
