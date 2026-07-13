#!/usr/bin/env bash
# Deploy patient-app to Vercel (static Vite client + /api/fhir serverless proxy).
# Requires: Vercel CLI authenticated (`vercel login` or VERCEL_TOKEN).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT_NAME="${VERCEL_PROJECT_NAME:-fhir-patient-app}"
FHIR_BASE_URL="${FHIR_BASE_URL:-http://34.20.191.118:8080/fhir}"
FHIR_ACCESS_TOKEN="${FHIR_ACCESS_TOKEN:-}"

if ! command -v vercel >/dev/null 2>&1; then
  echo "Install Vercel CLI: npm i -g vercel"
  exit 1
fi

if ! vercel whoami >/dev/null 2>&1; then
  echo "Not logged in to Vercel. Run: vercel login"
  echo "Or set VERCEL_TOKEN for non-interactive deploy."
  exit 1
fi

echo "Project:       ${PROJECT_NAME}"
echo "FHIR_BASE_URL: ${FHIR_BASE_URL}"
echo ""

vercel link --yes --project="${PROJECT_NAME}" 2>/dev/null || vercel link --yes

set_env() {
  local name="$1"
  local value="$2"
  printf '%s' "$value" | vercel env rm "$name" production --yes 2>/dev/null || true
  printf '%s' "$value" | vercel env add "$name" production
}

echo "Setting environment variables..."
set_env "FHIR_BASE_URL" "$FHIR_BASE_URL"
if [[ -n "${FHIR_ACCESS_TOKEN}" ]]; then
  set_env "FHIR_ACCESS_TOKEN" "$FHIR_ACCESS_TOKEN"
fi

echo ""
echo "Deploying to production..."
DEPLOY_URL="$(vercel deploy --prod --yes)"
echo ""
echo "Deployed: ${DEPLOY_URL}"

echo ""
echo "Verifying FHIR proxy..."
curl -sf "${DEPLOY_URL}/api/fhir/metadata" | head -c 200
echo ""
curl -sf "${DEPLOY_URL}/api/fhir/Patient?_count=2" | head -c 300
echo ""
echo ""
echo "Open in browser: ${DEPLOY_URL}"
