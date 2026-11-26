# Cloud Run release and rollback runbook (VC-ADR-041)

Owner 2026-11-26: the API may run on Cloud Run only, *"แต่ไม่อยากให้เกิด"* an outage. Three protections:

| Protection | Where | What it does |
|---|---|---|
| Safe deploy | GitHub → Actions → *Deploy P6 Vehicle Contact API to Cloud Run* (`DEPLOY_VEHICLE_CLOUDRUN`) | New revision gets **no traffic** first (tag `candidate`), is smoked on its private URL, then gets 100 %. The live URL is smoked again; on failure traffic goes **back to the previous revision** automatically and the run fails. |
| One-click rollback | GitHub → Actions → *Roll back P6 Vehicle Contact API on Cloud Run* (`ROLLBACK_VEHICLE_CLOUDRUN`) | Moves all traffic to the previous READY revision (or a named one) in seconds, then smokes the live URL. No rebuild. |
| Outage e-mail | `apps/vehicle-contact/ops/cloudrun-uptime-alert.sh <e-mail>` in Cloud Shell (owner, once) | Uptime check every 5 minutes from 3 regions; e-mail after 5 minutes failing and again on recovery. |

## Smoke (what "healthy" means)
`backend/cloudrun/candidate-smoke.mjs <url> [--version x | --any-version]` — public, no credentials, no writes:
1. `GET /` → `status: ready` and `backendVersion` = `backend/gas/scripts/expected-live-version.json` (deploy) / any (rollback)
2. `POST system.health` → ok
3. `POST campaigns.validate` with an unknown token → `CAMPAIGN_INVALID` (proves Firestore + credentials; a broken database gives `OPERATION_FAILED`)
4. `POST vehicles.list` without a session → `UNAUTHENTICATED`
5. `apiVersion: v9` → `BAD_REQUEST`

## When the alert e-mail arrives
1. Open GitHub → Actions → *Roll back P6 Vehicle Contact API on Cloud Run* → Run workflow → type `ROLLBACK_VEHICLE_CLOUDRUN` (leave revision empty).
2. Wait for the green tick (about 1–2 minutes). The alert closes by itself when the uptime check passes again.
3. Tell the developer which deploy preceded the outage; the next deploy must include a fix and pass the smoke.

## GAS (Drive photo bridge) rollback
Photos go through the GAS web app. To return it to the previous version: `npx @google/clasp@3.4.1 -u p6vc list-versions`, then
`npx @google/clasp@3.4.1 -u p6vc update-deployment <deploymentId> -V <previous>` (deployment id in `deploy-vehicle-cloudrun.yml` `MEDIA_BRIDGE_URL`).

## Proven on 2026-11-26
| What | Result |
|---|---|
| Safe deploy | candidate `p6vc-api-00020-yok` smoked 5/5 with no traffic, switched, live smoke 5/5 |
| One-click rollback | `00020-yok` → `00019-9zt` in about a minute, live smoke 5/5; full live suite 112/112 + DATA_PROOF 7/7 afterwards |
| Uptime check | `p6vc-api-health` passing in every region (first latency ~1.5 s = cold start) |
| Alert e-mail | drill alert e-mail arrived about 5 minutes after the drill started |

## Alert drill (repeat after changing the e-mail or the policy)
The console has no "send test notification" for e-mail channels any more. Instead, in Cloud Shell create a temporary
uptime check that always fails (same URL, expects text the API never returns, every minute) plus a policy on the same
e-mail channel, wait for the e-mail (~5 min), then delete both. Both carry "drill" in their names; the real check and
policy are never touched. Script: `apps/vehicle-contact/ops/cloudrun-alert-drill.sh` (start) and `... stop` (always run it).

## Notes
- Revisions keep their own environment (e.g. `P6VC_SYSTEM_RESET`): rolling back also rolls back those switches.
- A rollback never touches Firestore data. A release that changed data shape needs its own data rollback plan.
- `min-instances` stays 0 (no always-on cost); the uptime check also keeps one instance warm most of the time.
