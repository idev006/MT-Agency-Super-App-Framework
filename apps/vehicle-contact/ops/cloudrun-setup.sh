#!/usr/bin/env bash
# P6VC Cloud Run one-time setup (VC-ADR-033). Run by the PROJECT OWNER in Google Cloud Shell
# (https://shell.cloud.google.com), signed in as the project owner. Safe to re-run.
# Creates: APIs, Artifact Registry repo, 2 service accounts (runtime + GitHub deployer),
# keyless GitHub OIDC trust limited to ONE repository's main branch, and the pepper secret.
# The pepper is typed by the owner (hidden input); it is never printed.
set -euo pipefail

PROJECT_ID="mt-iam-core-2026"
REGION="asia-southeast3"
REPO="idev006/MT-Agency-Super-App-Framework"
AR_REPO="p6vc"
RUNTIME_SA="p6vc-api-runtime"
DEPLOYER_SA="p6vc-github-deployer"
POOL="github"
PROVIDER="p6vc-repo"
SECRET="p6vc-auth-pepper"

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOYER_EMAIL="${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "1/6 Enabling APIs (Cloud Run, Artifact Registry, Secret Manager, IAM Credentials, STS)..."
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com firestore.googleapis.com

echo "2/6 Artifact Registry repository ${AR_REPO} in ${REGION}..."
gcloud artifacts repositories describe "$AR_REPO" --location "$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "$AR_REPO" --repository-format=docker --location "$REGION" \
    --description="P6VC API images"

echo "3/6 Service accounts..."
gcloud iam service-accounts describe "$RUNTIME_EMAIL" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$RUNTIME_SA" --display-name="P6VC API runtime (Cloud Run)"
gcloud iam service-accounts describe "$DEPLOYER_EMAIL" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$DEPLOYER_SA" --display-name="P6VC GitHub deployer"
# Runtime: read/write Firestore only.
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${RUNTIME_EMAIL}" \
  --role="roles/datastore.user" --condition=None >/dev/null
# Deployer: deploy Cloud Run revisions, push images, act as the runtime SA (nothing else).
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${DEPLOYER_EMAIL}" \
  --role="roles/run.admin" --condition=None >/dev/null
gcloud artifacts repositories add-iam-policy-binding "$AR_REPO" --location "$REGION" \
  --member="serviceAccount:${DEPLOYER_EMAIL}" --role="roles/artifactregistry.writer" >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_EMAIL" \
  --member="serviceAccount:${DEPLOYER_EMAIL}" --role="roles/iam.serviceAccountUser" >/dev/null

echo "4/6 Keyless GitHub trust (only ${REPO}, only branch main)..."
gcloud iam workload-identity-pools describe "$POOL" --location=global >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers describe "$PROVIDER" --workload-identity-pool="$POOL" --location=global >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --workload-identity-pool="$POOL" --location=global \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository=='${REPO}' && assertion.ref=='refs/heads/main'"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}" >/dev/null

echo "5/6 Auth pepper secret (${SECRET})..."
if gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
  echo "   Secret already exists - left unchanged."
else
  echo "   Paste the value of Script Property VEHICLE_AUTH_PEPPER (input is hidden), then Enter:"
  read -rs PEPPER
  if [ "${#PEPPER}" -lt 32 ]; then echo "   Value looks too short - aborting without creating the secret."; exit 1; fi
  printf '%s' "$PEPPER" | gcloud secrets create "$SECRET" --replication-policy=user-managed --locations="$REGION" --data-file=-
  unset PEPPER
  echo "   Secret created."
fi
gcloud secrets add-iam-policy-binding "$SECRET" --member="serviceAccount:${RUNTIME_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" >/dev/null

echo "6/6 Allow the public endpoint (app-level auth still applies to every operation)..."
echo "   (Cloud Run grants allUsers invoker at first deploy via --allow-unauthenticated.)"

echo
echo "DONE. Send these two NON-secret values to Claude (they become GitHub repository variables):"
echo "GCP_WIF_PROVIDER=projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"
echo "GCP_DEPLOYER_SA=${DEPLOYER_EMAIL}"
