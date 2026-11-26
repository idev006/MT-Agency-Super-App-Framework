#!/usr/bin/env bash
# P6VC outage alert (VC-ADR-041; owner 2026-11-26: Cloud Run only is fine "แต่ไม่อยากให้เกิด" an outage).
# Run by the PROJECT OWNER in Google Cloud Shell (https://shell.cloud.google.com). Safe to re-run.
#   bash cloudrun-uptime-alert.sh you@example.com
# Creates (Cloud Monitoring, within the free allotment):
#   - an e-mail notification channel to the address given (asked here, never stored in the repo)
#   - an uptime check: GET https://<p6vc-api>/ every 5 minutes from 3 regions, must contain "status":"ready"
#   - an alert policy: e-mail when the check fails from 2+ regions for 5 minutes; e-mail again when it recovers
# What to do on an alert: GitHub → Actions → "Roll back P6 Vehicle Contact API on Cloud Run" (ROLLBACK_VEHICLE_CLOUDRUN).
set -euo pipefail

EMAIL="${1:-}"
if ! [[ "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then echo "usage: bash $0 <alert e-mail>"; exit 1; fi
PROJECT_ID="mt-iam-core-2026"
HOST="p6vc-api-46858005337.asia-southeast3.run.app"
CHECK_NAME="p6vc-api-health"
POLICY_NAME="P6VC API down (uptime)"

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
  "documentation": {"mimeType": "text/markdown", "content": "P6VC API is not answering ready. Roll back: GitHub → Actions → Roll back P6 Vehicle Contact API on Cloud Run (type ROLLBACK_VEHICLE_CLOUDRUN)."},
  "notificationChannels": ["$CHANNEL"]
}
JSON
  gcloud alpha monitoring policies create --policy-from-file="$POLICY_FILE"
  rm -f "$POLICY_FILE"
fi
echo "Done. Google sends a confirmation only for some channel types; check the inbox of $EMAIL."
