// The acceptance harness through the Node core (VC-ADR-051): the SAME seeds, fake Drive and fake security as the legacy
// harness (gas/tests/acceptance-fixture.mjs), with the core in front — exactly like production: the core answers the
// operations it has, everything else is forwarded to the legacy engine; both work on ONE in-memory store. So the legacy
// acceptance tests (generated as async copies by scripts/gen-core-acceptance.mjs) run end to end through the core, and
// keep passing while operations move from the legacy engine to the core.
import {createAcceptanceHarness as legacyHarness, PHOTO_SLOTS} from '../../../gas/tests/acceptance-fixture.mjs';
import {createCoreFacade} from '../../src/facade/operations.mjs';
import {createRouter} from '../../src/http/routing.mjs';
export {PHOTO_SLOTS, SAMPLE_PASSWORD, FIXED_NOW, assertOk, assertError} from '../../../gas/tests/acceptance-fixture.mjs';

// the core's async Store port over the harness's synchronous store (the same rows, the same injected failures)
export function asyncStoreOver(store) {
  const readOne = r => (r.kind === 'one' ? store.one(r.name, r.filter)
    : r.kind === 'versioned' ? {row: store.one(r.name, r.filter), version: null}
      : r.kind === 'count' ? store.list(r.name, r.filter).length
        : r.kind === 'newest' ? store.listNewest(r.name, r.filter, r.limit || 1)
          : store.list(r.name, r.filter, ...(r.limit ? [r.limit] : [])));
  const self = {
    supportsTtl: false,
    one: async (t, f) => store.one(t, f),
    list: async (t, f, l) => store.list(t, f, ...(l ? [l] : [])),
    listNewest: async (t, f, l) => store.listNewest(t, f, l),
    count: async (t, f) => store.list(t, f).length,
    insert: async (t, row) => store.insert(t, row),
    update: async (t, f, fields) => store.update(t, f, fields),
    remove: async (t, f) => store.remove(t, f),
    patch: async (t, f, fields) => (store.update(t, f, fields), true),
    writeMany: async ops => store.writeMany(ops),
    readMany: async (reqs, opts = {}) => { for (const [t, row] of opts.inserts || []) store.insert(t, row); return reqs.map(readOne); },
    withLock: async fn => fn(),
    sequence: async fn => fn(self) // the harness store has no isolation either; one in-memory store
  };
  return self;
}

export function createAcceptanceHarness(options = {}) {
  const h = legacyHarness(options);
  const s = h.security;
  const core = createCoreFacade({store: asyncStoreOver(h.store),
    media: {read: async r => h.drivePhotos.read(r), upload: async (b, m) => h.drivePhotos.upload(b, m), trash: async r => h.drivePhotos.trash(r),
      list: async t => (h.drivePhotos.list ? h.drivePhotos.list(t) : {files: [], nextPageToken: null}),
      organize: async req => (h.drivePhotos.organize ? h.drivePhotos.organize(req) : {folderId: ''}),
      stat: async refs => (h.drivePhotos.stat ? h.drivePhotos.stat(refs) : {files: []}),
      trashAll: async () => h.drivePhotos.trashAll()},
    passwords: {hash: async p => s.hashPassword(p), verify: async (p, stored) => (stored == null ? false : s.verifyPassword(p, stored))},
    google: {verify: async token => s.verifyGoogle(token)},
    now: () => s.now(), sha256: x => s.sha256(x), id: () => s.secretToken(), deriveSecret: purpose => s.deriveSecret(purpose), retentionExecuteEnabled: true, resetEnabled: options.allowSystemReset === true});
  const router = createRouter({legacy: {dispatch: async (e, m) => h.dispatch(e, m)}, core});
  const call = (operation, payload = {}, actor = null, opts = {}) => {
    const [group, ...actions] = operation.split('.');
    return router.dispatch({apiVersion: opts.version || 'v1', group, action: actions.join('.'), payload,
      ...(actor ? {sessionToken: h.tokens[actor]} : {}), requestId: 'syntheticAcceptance'}, opts.method || 'POST');
  };
  const as = (actor, operation, payload) => call(operation, payload, actor);
  async function stagePhotos(campaignToken) {
    const photos = [];
    for (const slot of PHOTO_SLOTS) {
      const r = await call('photos.upload', {campaignToken, slot, base64Image: 'AAAA-binary-fake', mimeType: 'image/png'});
      if (!r.ok) throw Error('photos.upload failed: ' + JSON.stringify(r));
      photos.push({slot, photoId: r.data.photoId});
    }
    return photos;
  }
  async function createCampaign() {
    const c = await as('sys', 'campaigns.create', {startsAt: '2026-11-17T00:00:00.000Z', endsAt: '2026-11-20T00:00:00.000Z', maxSubmissions: 5});
    if (!c.ok) throw Error('createCampaign: ' + JSON.stringify(c)); return c.data;
  }
  async function createOrganization() {
    const o = await as('sys', 'organizations.create', {name: 'Synthetic Region Six', type: 'POLICE'});
    if (!o.ok) throw Error('createOrganization: ' + JSON.stringify(o)); return o.data.organizationId;
  }
  return {...h, call, as, stagePhotos, createCampaign, createOrganization, core, engineFor: op => router.engineFor(op)};
}
