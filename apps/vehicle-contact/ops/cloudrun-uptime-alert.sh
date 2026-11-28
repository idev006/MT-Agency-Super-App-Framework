#!/usr/bin/env bash
# P6VC outage alert (VC-ADR-041; owner 2026-11-26: Cloud Run only is fine "แต่ไม่อยากให้เกิด" an outage).
# Run by the PROJECT OWNER in Google Cloud Shell (https://shell.cloud.google.com). Safe to re-run.
#   bash cloudrun-uptime-alert.sh you@example.com
# Creates (Cloud Monitoring, within the free allotment):
#   - an e-mail notification channel to the address given (asked here, never stored in the repo)
#   - an uptime check: GET https://<p6vc-core>/ every 5 minutes from 3 regions, must contain "status":"ready"
#   - an alert policy: e-mail when the check fails from 2+ regions for 5 minutes; e-mail again when it recovers
#   - and REMOVES the retired p6vc-api check "p6vc-api-health" + policy "P6VC API down (uptime)" (p6vc-api retired 2026-11-28)
# What to do on an alert: Cloud Console → Cloud Run → p6vc-core → Revisions → send 100% traffic to the previous revision
# (the deploy also rolls back by itself when its live smoke fails).
set -euo pipefail

EMAIL="${1:-}"
if ! [[ "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then echo "usage: bash $0 <alert e-mail>"; exit 1; fi
PROJECT_ID="mt-iam-core-2026"
# the core host from ONE place (contracts/trusted-endpoints.v1.json, id cloud-run-core) — run from a checkout of the repo
HOST="$(grep -o 'p6vc-core-[0-9]*\.[a-z0-9-]*\.run\.app' "$(dirname "$0")/../contracts/trusted-endpoints.v1.json" | head -1)"
[ -n "$HOST" ] || { echo "core host not found in contracts/trusted-endpoints.v1.json (run from the repo checkout)"; exit 1; }
CHECK_NAME="p6vc-core-health"
POLICY_NAME="P6VC core down (uptime)"
OLD_CHECK_NAME="p6vc-api-health"
OLD_POLICY_NAME="P6VC API down (uptime)"

gcloud config set project "$PROJECT_ID" >/dev/null
echo "1/4 Enabling Cloud Monitoring API..."
gcloud services enable monitoring.googleapis.com

echo "2/4 E-mail notification channel..."
CHANNEL="$(gcloud beta monitoring channels list --filter="type=\"email\" AND labels.email_address=\"$EMAIL\"" --format='value(name)' | head -1)"
if [ -z "$CHANNEL" ]; then
  CHANNEL="$(gcloud beta monitoring channels create --display-name="P6VC alerts" --type=email \
    --channel-labels="email_address=$EMAIL" --format='value(name)')"
fi
echo "   channel: $CHANNEL"

echo "3/4 Uptime check (every 5 minutes)..."
CHECK_ID="$(gcloud monitoring uptime list-configs --filter="displayName=\"$CHECK_NAME\"" --format='value(name)' | head -1 | sed 's#.*/##')"
if [ -z "$CHECK_ID" ]; then
  gcloud monitoring uptime create "$CHECK_NAME" --resource-type=uptime-url \
    --resource-labels="host=$HOST,project_id=$PROJECT_ID" --protocol=https --path=/ --period=5 --timeout=30 \
    --matcher-content='"status":"ready"' --matcher-type=contains-string
  CHECK_ID="$(gcloud monitoring uptime list-configs --filter="displayName=\"$CHECK_NAME\"" --format='value(name)' | head -1 | sed 's#.*/##')"
fi
echo "   uptime check id: $CHECK_ID"

echo "4/4 Alert policy..."
if [ -z "$(gcloud alpha monitoring policies list --filter="displayName=\"$POLICY_NAME\"" --format='value(name)')" ]; then
  POLICY_FILE="$(mktemp)"
  cat > "$POLICY_FILE" <<JSON
{
  "displayName": "$POLICY_NAME",
  "combiner": "OR",
  "conditions": [{
    "displayName": "Uptime check failing",
    "conditionThreshold": {
      "filter": "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"$CHECK_ID\"",
      "aggregations": [{"alignmentPeriod": "300s", "perSeriesAligner": "ALIGN_NEXT_OLDER", "crossSeriesReducer": "REDUCE_COUNT_FALSE", "groupByFields": ["resource.label.host"]}],
      "comparison": "COMPARISON_GT", "thresholdValue": 1, "duration": "300s",
      "trigger": {"count": 1}
    }
  }],
  "alertStrategy": {"autoClose": "1800s", "notificationPrompts": ["OPENED", "CLOSED"]},
  "documentation": {"mimeType": "text/markdown", "content": "P6VC core (p6vc-core) is not answering ready. Roll back: Cloud Console → Cloud Run → p6vc-core → Revisions → 100% to the previous revision."},
  "notificationChannels": ["$CHANNEL"]
}
JSON
  gcloud alpha monitoring policies create --policy-from-file="$POLICY_FILE"
  rm -f "$POLICY_FILE"
fi
echo "Retiring the p6vc-api check and policy (the service was retired 2026-11-28)..."
for p in $(gcloud alpha monitoring policies list --filter="displayName=\"$OLD_POLICY_NAME\"" --format='value(name)'); do gcloud alpha monitoring policies delete "$p" --quiet; done
for c in $(gcloud monitoring uptime list-configs --filter="displayName=\"$OLD_CHECK_NAME\"" --format='value(name)'); do gcloud monitoring uptime delete "$c" --quiet; done
echo "Done. Google sends a confirmation only for some channel types; check the inbox of $EMAIL."
