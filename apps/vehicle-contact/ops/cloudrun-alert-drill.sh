#!/usr/bin/env bash
# P6VC alert drill (VC-ADR-041). Proves the outage e-mail reaches the owner WITHOUT an outage. Run by the PROJECT OWNER in
# Google Cloud Shell. The console no longer offers "send test notification" for e-mail channels, hence this drill.
#   bash cloudrun-alert-drill.sh          start: a temporary uptime check that always fails (same URL, every minute,
#                                         expects text the API never returns) + a policy on the existing e-mail channel
#   bash cloudrun-alert-drill.sh stop     delete both (always run it, even if no e-mail came)
# The e-mail ("P6VC alert drill", "DRILL - not a real outage") arrives in about 5 minutes. The real uptime check
# "p6vc-core-health" and the real policy "P6VC core down (uptime)" are never touched. First run: 2026-11-26, e-mail in ~5 min.
set -euo pipefail
P="mt-iam-core-2026"
H="$(grep -o 'p6vc-core-[0-9]*\.[a-z0-9-]*\.run\.app' "$(dirname "$0")/../contracts/trusted-endpoints.v1.json" | head -1)"
[ -n "$H" ] || { echo "core host not found in contracts/trusted-endpoints.v1.json (run from the repo checkout)"; exit 1; }
gcloud config set project "$P" >/dev/null
if [ "${1:-}" = "stop" ]; then
  for p in $(gcloud alpha monitoring policies list --filter='displayName="P6VC alert drill"' --format='value(name)'); do gcloud alpha monitoring policies delete "$p" --quiet; done
  for c in $(gcloud monitoring uptime list-configs --filter='displayName="p6vc-alert-drill"' --format='value(name)'); do gcloud monitoring uptime delete "${c##*/}" --quiet; done
  echo DRILL_STOPPED; exit 0
fi
CH="$(gcloud beta monitoring channels list --filter='displayName="P6VC alerts"' --format='value(name)' | head -1)"
if [ -z "$CH" ]; then echo "no 'P6VC alerts' e-mail channel: run cloudrun-uptime-alert.sh first"; exit 1; fi
gcloud monitoring uptime create p6vc-alert-drill --resource-type=uptime-url --resource-labels="host=$H,project_id=$P" \
  --protocol=https --path=/ --period=1 --timeout=10 --matcher-content=ALERT_DRILL_NEVER_PRESENT --matcher-type=contains-string
ID="$(gcloud monitoring uptime list-configs --filter='displayName="p6vc-alert-drill"' --format='value(name)' | head -1 | sed 's#.*/##')"
POLICY_FILE="$(mktemp)"
cat > "$POLICY_FILE" <<JSON
{"displayName":"P6VC alert drill","combiner":"OR","conditions":[{"displayName":"drill check failing","conditionThreshold":{"filter":"metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"$ID\"","aggregations":[{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_NEXT_OLDER","crossSeriesReducer":"REDUCE_COUNT_FALSE","groupByFields":["resource.label.host"]}],"comparison":"COMPARISON_GT","thresholdValue":1,"duration":"60s","trigger":{"count":1}}}],"alertStrategy":{"autoClose":"1800s"},"documentation":{"mimeType":"text/markdown","content":"DRILL - not a real outage. P6VC alert e-mail test; delete with: bash cloudrun-alert-drill.sh stop"},"notificationChannels":["$CH"]}
JSON
gcloud alpha monitoring policies create --policy-from-file="$POLICY_FILE"
rm -f "$POLICY_FILE"
echo "DRILL_STARTED $ID — wait for the e-mail (~5 min), then: bash cloudrun-alert-drill.sh stop"
