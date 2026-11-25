// VC-ADR-036 S2 (owner 2026-11-25: "รายละเอียดของรถ ต้องแสดงให้ครบถ้วนทุกมิติ"). Extra dimensions of the
// vehicle DETAIL view, gated by permission on the server:
//  - vehicle.list holders (SYSTEM_ADMIN, REGISTRATION_ADMIN): owner account, created/updated by,
//    registration origin (campaign, reviewer), change requests, retention job.
//  - audit.read holders (SYSTEM_ADMIN only, owner decision 3): access log = newest 50 lookups of this vehicle.
// STAFF / OWNER receive none of these fields. Two parallel rounds (rows, then names); no tokens/digests.
const ACCESS_LOG_LIMIT = 50;

export function createVehicle360({store}) {
  function readAll(reqs) {
    if (!reqs.length) return [];
    if (typeof store.readMany === 'function') return store.readMany(reqs);
    return reqs.map(r => r.kind === 'one' ? store.one(r.name, r.filter)
      : r.kind === 'newest' ? (typeof store.listNewest === 'function' ? store.listNewest(r.name, r.filter, r.limit) : store.list(r.name, r.filter).slice(-r.limit))
        : store.list(r.name, r.filter));
  }
  return function vehicle360(v, actor) {
    const can = p => actor.permissions.includes(p);
    const admin = can('vehicle.list'), auditor = can('audit.read');
    if (!v || (!admin && !auditor)) return {};
    const reqs = [], at = {};
    const add = (k, r) => { at[k] = reqs.length; reqs.push(r); };
    if (admin) {
      add('reg', {kind: 'list', name: 'vc_registration_requests', filter: {vehicle_id: v.vehicle_id}});
      add('chg', {kind: 'list', name: 'vc_change_requests', filter: {vehicle_id: v.vehicle_id}});
      add('ret', {kind: 'list', name: 'vc_retention_jobs', filter: {vehicle_id: v.vehicle_id}});
    }
    if (auditor) add('acc', {kind: 'newest', name: 'vc_lookup_audit', filter: {vehicle_id: v.vehicle_id}, limit: ACCESS_LOG_LIMIT});
    const rows = readAll(reqs);
    const pick = k => (k in at ? rows[at[k]] || [] : []);
    const regs = pick('reg'), changes = pick('chg'), jobs = pick('ret'), access = pick('acc');
    const reg = regs.filter(r => r.status === 'APPROVED').slice(-1)[0] || regs.slice(-1)[0] || null;

    // Round 2: display names + campaign name (equality reads, parallel).
    const userIds = new Set();
    if (admin) [v.owner_user_id, v.created_by, v.updated_by, reg && reg.reviewed_by,
      ...changes.flatMap(c => [c.submitted_by, c.reviewed_by]), ...jobs.map(j => j.approved_by)].forEach(u => u && userIds.add(u));
    access.forEach(a => a.actor_id && userIds.add(a.actor_id));
    const ids = [...userIds];
    const second = ids.map(u => ({kind: 'one', name: 'vc_users', filter: {user_id: u}}));
    if (reg && reg.campaign_id) second.push({kind: 'one', name: 'vc_campaigns', filter: {campaign_id: reg.campaign_id}});
    const named = readAll(second);
    const names = new Map(ids.map((u, i) => [u, (named[i] && named[i].display_name) || '']));
    const campaign = reg && reg.campaign_id ? named[ids.length] : null;
    const nameOf = u => (u ? names.get(u) || '' : '');

    const out = {};
    if (admin) {
      out.owner = v.owner_user_id ? {name: nameOf(v.owner_user_id)} : null;
      out.createdByName = nameOf(v.created_by);
      out.updatedByName = nameOf(v.updated_by);
      out.registration = reg ? {status: reg.status, submittedAt: reg.submitted_at || '', reviewedAt: reg.reviewed_at || '',
        reviewedByName: nameOf(reg.reviewed_by), campaignName: (campaign && campaign.campaign_name) || '', viaCampaign: Boolean(reg.campaign_id)} : null;
      out.changeRequests = changes.map(c => {
        let fields = [];
        try { fields = Object.keys(JSON.parse(c.proposed_delta || '{}')); } catch (_) { fields = []; }
        return {status: c.status, submittedAt: c.submitted_at || '', submittedByName: nameOf(c.submitted_by),
          reviewedAt: c.reviewed_at || '', reviewedByName: nameOf(c.reviewed_by), fields};
      }).reverse();
      const job = jobs.slice(-1)[0];
      out.retention = job ? {status: job.status, dueAt: job.due_at || '', approvedAt: job.approved_at || '',
        approvedByName: nameOf(job.approved_by), legalHold: job.legal_hold === true || job.legal_hold === 'true'} : null;
    }
    if (auditor) out.accessLog = access.map(a => ({at: a.created_at || '', actorName: nameOf(a.actor_id),
      source: a.lookup_source || '', result: a.result || ''})).sort((x, y) => String(y.at).localeCompare(String(x.at)));
    return out;
  };
}
