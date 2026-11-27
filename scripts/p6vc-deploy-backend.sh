#!/usr/bin/env bash
# P6VC backend deploy chain, in the project's deploy order (.mt-studio/project.yaml deploy.steps):
#   [indexes] → GAS push (PUSH_VEHICLE_GAS) → pin the web-app deployment to the new version (clasp) → p6vc-api (legacy
#   Cloud Run) → p6vc-core → Cloud Run Jobs (mode KEEP, runs the read-only photo audit once).
# The Cloudflare Worker (tools/p6vc-api-test-console) is NOT deployed here (separate: npx wrangler@4 deploy).
# GitHub Pages deploys by itself on every merge to main.
#
# Owner rule: every deploy needs the owner's OK for THAT round ("Merge + deploy"). This script refuses to run without
#   P6VC_OWNER_OK=MERGE_AND_DEPLOY   — set it only after the owner said so in this round.
#
# usage (from anywhere in the repo, Git Bash):
#   P6VC_OWNER_OK=MERGE_AND_DEPLOY scripts/p6vc-deploy-backend.sh <merged main short sha> "<short description>" [--indexes]
#   --indexes  first apply contracts/firestore-indexes.v1.json (needed when that file changed; ALWAYS before the backend)
# needs: gh (logged in), npx, clasp login "p6vc" (-u p6vc), and for --indexes the gitignored backend/gas/.env (names only).
# Then prove it (NOT done here): the live suite through the core + DATA_PROOF fresher than the suite — see
#   apps/vehicle-contact/docs/PROJECT_HANDOVER.md §5.
set -u
[ "${P6VC_OWNER_OK:-}" = "MERGE_AND_DEPLOY" ] || { echo "REFUSED: set P6VC_OWNER_OK=MERGE_AND_DEPLOY only after the owner's OK for this round"; exit 2; }
SHA="${1:?merged main short sha}"; DESC="${2:?description}"; INDEXES="${3:-}"
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

gh workflow run deploy-vehicle-gas.yml --ref main -f confirmation=PUSH_VEHICLE_GAS >/dev/null
until RID=$(gh run list --workflow deploy-vehicle-gas.yml --limit 1 --json databaseId,headSha -q ".[0] | select(.headSha|startswith(\"$SHA\")) | .databaseId") && [ -n "$RID" ]; do sleep 3; done
watch "$RID" "GAS"
V=$(gh run view "$RID" --log 2>/dev/null | grep -o 'Created version [0-9]*' | tail -1 | grep -o '[0-9]*$')
[ -n "$V" ] || { echo "FAILED: no 'Created version N' in the GAS run log"; exit 1; }
echo "V=$V"
(cd apps/vehicle-contact/backend/gas && npx -y @google/clasp@3.4.1 -u p6vc update-deployment "$DEPLOYMENT" -V "$V" -d "$DESC" 2>&1 | tail -1)

for w in "deploy-vehicle-cloudrun.yml DEPLOY_VEHICLE_CLOUDRUN" "deploy-vehicle-core.yml DEPLOY_VEHICLE_CORE"; do
  set -- $w
  gh workflow run "$1" --ref main -f confirmation="$2" >/dev/null; sleep 8
  watch "$(latest "$1")" "$1"
done
gh workflow run deploy-vehicle-jobs.yml --ref main -f confirmation=DEPLOY_VEHICLE_JOBS -f mode=KEEP -f run_job=p6vc-photo-audit >/dev/null; sleep 10
RID=$(latest deploy-vehicle-jobs.yml); watch "$RID" "jobs"
gh run view "$RID" --log 2>/dev/null | grep -E "Housekeeping mode:|Execution:" | grep -v '\[36;1m' | sed 's/^.*Z //' | cut -c1-120
echo "DEPLOYED $SHA (GAS @$V). Now prove it: live suite through the core + DATA_PROOF (PROJECT_HANDOVER.md §5)."
