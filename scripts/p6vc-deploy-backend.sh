#!/usr/bin/env bash
# P6VC backend deploy chain, in the project's deploy order (.mt-studio/project.yaml deploy.steps):
#   [indexes] → GAS push (PUSH_VEHICLE_GAS) → pin the web-app deployment to the new version (clasp) → p6vc-api (legacy
#   Cloud Run) → p6vc-core → Cloud Run Jobs (mode KEEP, runs the read-only photo audit once).
# There is no Cloudflare Worker any more (retired, VC-ADR-056 W1).
# GitHub Pages deploys by itself on every merge to main.
#
# Owner 2026-11-28 (VC-ADR-052) approved subsequent synthetic-DEV merges/deploys once. This script still refuses without
#   P6VC_OWNER_OK=MERGE_AND_DEPLOY   — set this execution guard for each run under that approval.
#
# usage (from anywhere in the repo, Git Bash):
#   P6VC_OWNER_OK=MERGE_AND_DEPLOY scripts/p6vc-deploy-backend.sh <merged main short sha> "<short description>" [--indexes] [--bridge-only]
#   --indexes      first apply contracts/firestore-indexes.v1.json (needed when that file changed; ALWAYS before the backend)
#   --bridge-only  G1: push ONLY the signed photo bridge to GAS (every other GAS file is removed); also needs
#                  P6VC_OWNER_OK_REMOVE_GAS_FILES=REMOVE_GAS_API_FILES (the owner's separate confirmation for that round)
# After the pin, scripts/verify-bridge-live.mjs checks which artifact answers and its version; on failure the previous
# version is printed for the rollback (clasp update-deployment <id> -V <previous>).
# needs: gh (logged in), npx, clasp login "p6vc" (-u p6vc), and for --indexes the gitignored backend/gas/.env (names only).
# Then prove it (NOT done here): the live suite through the core + DATA_PROOF fresher than the suite — see
#   apps/vehicle-contact/docs/PROJECT_HANDOVER.md §5.
set -u
[ "${P6VC_OWNER_OK:-}" = "MERGE_AND_DEPLOY" ] || { echo "REFUSED: set P6VC_OWNER_OK=MERGE_AND_DEPLOY only after the owner's OK for this round"; exit 2; }
SHA="${1:?merged main short sha}"; DESC="${2:?description}"; shift 2
INDEXES=""; ARTIFACT=full
for a in "$@"; do case "$a" in --indexes) INDEXES=--indexes;; --bridge-only) ARTIFACT=bridge;; *) echo "REFUSED: unknown option $a"; exit 2;; esac; done
if [ "$ARTIFACT" = bridge ] && [ "${P6VC_OWNER_OK_REMOVE_GAS_FILES:-}" != "REMOVE_GAS_API_FILES" ]; then
  echo "REFUSED: --bridge-only removes every other GAS file; set P6VC_OWNER_OK_REMOVE_GAS_FILES=REMOVE_GAS_API_FILES only after the owner confirmed it"; exit 2
fi
cd "$(git rev-parse --show-toplevel)" || exit 1
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "REFUSED: check out main (git fetch origin main && git merge --ff-only FETCH_HEAD)"; exit 2; }
git rev-parse --verify -q "$SHA^{commit}" >/dev/null || { echo "REFUSED: $SHA is not a local commit"; exit 2; }
# the GAS web-app deployment the media bridge calls — one source: deploy-vehicle-cloudrun.yml MEDIA_BRIDGE_URL
DEPLOYMENT=$(grep -o 'macros/s/[A-Za-z0-9_-]*/exec' .github/workflows/deploy-vehicle-cloudrun.yml | head -1 | sed 's#macros/s/##; s#/exec##')
[ -n "$DEPLOYMENT" ] || { echo "FAILED: no GAS deployment id in deploy-vehicle-cloudrun.yml"; exit 1; }

watch() { gh run watch "$1" --interval 20 --exit-status >/dev/null 2>&1; local rc=$?; echo "$2 RUN $1 EXIT $rc"; [ $rc -eq 0 ] || exit $rc; }
latest() { gh run list --workflow "$1" --limit 1 --json databaseId -q '.[0].databaseId'; }

if [ "$INDEXES" = "--indexes" ]; then
  (cd apps/vehicle-contact/backend/gas && P6VC_ALLOW_INDEX_ADMIN=ENSURE_FIRESTORE_INDEXES FIRESTORE_DATABASE_ID='(default)' node scripts/ensure-firestore-indexes.mjs --apply) || { echo "FAILED: indexes"; exit 1; }
fi

PREV=$(cd apps/vehicle-contact/backend/gas && npx -y @google/clasp@3.4.1 -u p6vc list-deployments 2>/dev/null | grep "$DEPLOYMENT" | grep -o '@[0-9]*' | tr -d '@')
echo "GAS web app pinned before: @${PREV:-unknown} (rollback target)"
if [ "$ARTIFACT" = bridge ]; then
  gh workflow run deploy-vehicle-gas.yml --ref main -f confirmation=PUSH_VEHICLE_GAS -f artifact=bridge -f remove_api_files=REMOVE_GAS_API_FILES >/dev/null
else
  gh workflow run deploy-vehicle-gas.yml --ref main -f confirmation=PUSH_VEHICLE_GAS >/dev/null
fi
until RID=$(gh run list --workflow deploy-vehicle-gas.yml --limit 1 --json databaseId,headSha -q ".[0] | select(.headSha|startswith(\"$SHA\")) | .databaseId") && [ -n "$RID" ]; do sleep 3; done
watch "$RID" "GAS"
V=$(gh run view "$RID" --log 2>/dev/null | grep -o 'Created version [0-9]*' | tail -1 | grep -o '[0-9]*$')
[ -n "$V" ] || { echo "FAILED: no 'Created version N' in the GAS run log"; exit 1; }
echo "V=$V"
(cd apps/vehicle-contact/backend/gas && npx -y @google/clasp@3.4.1 -u p6vc update-deployment "$DEPLOYMENT" -V "$V" -d "$DESC" 2>&1 | tail -1)
(cd apps/vehicle-contact/backend/gas && node scripts/verify-bridge-live.mjs --expect "$ARTIFACT") || {
  echo "FAILED: the GAS web app check after the pin. Roll back: (cd apps/vehicle-contact/backend/gas && npx @google/clasp@3.4.1 -u p6vc update-deployment $DEPLOYMENT -V ${PREV:-<previous>})"; exit 1; }

for w in "deploy-vehicle-cloudrun.yml DEPLOY_VEHICLE_CLOUDRUN" "deploy-vehicle-core.yml DEPLOY_VEHICLE_CORE"; do
  set -- $w
  gh workflow run "$1" --ref main -f confirmation="$2" >/dev/null; sleep 8
  watch "$(latest "$1")" "$1"
done
gh workflow run deploy-vehicle-jobs.yml --ref main -f confirmation=DEPLOY_VEHICLE_JOBS -f mode=KEEP -f run_job=p6vc-photo-audit >/dev/null; sleep 10
RID=$(latest deploy-vehicle-jobs.yml); watch "$RID" "jobs"
gh run view "$RID" --log 2>/dev/null | grep -E "Housekeeping mode:|Execution:" | grep -v '\[36;1m' | sed 's/^.*Z //' | cut -c1-120
echo "DEPLOYED $SHA (GAS @$V). Now prove it: live suite through the core + DATA_PROOF (PROJECT_HANDOVER.md §5)."
