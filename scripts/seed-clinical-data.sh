#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FHIR_BASE="${FHIR_BASE_URL:-http://localhost:8082/fhir}"
BUNDLE="$ROOT/seed/demo-clinical-bundle.json"
PATIENT_ID_SYSTEM="urn:oid:demo:patient-ids"

SKIP_GENERATE=false
PATIENT_COUNT="${SEED_PATIENT_COUNT:-5}"

for arg in "$@"; do
  if [ "$arg" = "--skip-generate" ]; then
    SKIP_GENERATE=true
  fi
done

if [ "$SKIP_GENERATE" = false ]; then
  echo "Generating seed bundle (${PATIENT_COUNT} patients)..."
  node "$ROOT/scripts/generate-seed-bundle.mjs" "$PATIENT_COUNT"
fi

echo "Posting transaction bundle to $FHIR_BASE ..."
HTTP_CODE=$(curl -s -o /tmp/fhir-seed-response.json -w "%{http_code}" \
  -X POST "$FHIR_BASE" \
  -H "Content-Type: application/fhir+json" \
  -d @"$BUNDLE")

if [ "$HTTP_CODE" -lt 200 ] || [ "$HTTP_CODE" -ge 300 ]; then
  echo "Transaction failed (HTTP $HTTP_CODE):"
  cat /tmp/fhir-seed-response.json
  exit 1
fi

echo "Transaction succeeded (HTTP $HTTP_CODE)."
echo ""
echo "Demo patients:"
echo ""

node -e "
  const fs = require('fs');
  const bundle = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
  const patients = (bundle.entry || [])
    .map(e => e.resource)
    .filter(r => r?.resourceType === 'Patient');
  for (const p of patients) {
    const ident = p.identifier?.[0]?.value ?? '';
    console.log(ident);
  }
" "$BUNDLE" | while read -r IDENT; do
  [ -z "$IDENT" ] && continue
  ROW=$(curl -s "$FHIR_BASE/Patient?identifier=$PATIENT_ID_SYSTEM|$IDENT")
  node -e "
    const b = JSON.parse(process.argv[1]);
    const p = (b.entry || []).map(e => e.resource).find(r => r?.resourceType === 'Patient');
    if (!p?.id) process.exit(0);
    const name = p.name?.[0];
    const label = [name?.given?.join(' '), name?.family].filter(Boolean).join(' ');
    console.log('  ' + label + '  id=' + p.id);
    console.log('    dev:    http://localhost:5173/patient/' + p.id);
    console.log('    docker: http://localhost:3002/patient/' + p.id);
  " "$ROW"
done

echo ""
echo "Verifying first demo patient (John Doe)..."
JOHN_JSON=$(curl -s "$FHIR_BASE/Patient?identifier=$PATIENT_ID_SYSTEM|DEMO-JOHN-DOE-001")
PATIENT_ID=$(node -e "
  const b = JSON.parse(process.argv[1]);
  const p = (b.entry || []).map(e => e.resource).find(r => r?.resourceType === 'Patient');
  if (!p?.id) process.exit(1);
  console.log(p.id);
" "$JOHN_JSON")

OBS_COUNT=$(curl -s "$FHIR_BASE/Observation?subject=Patient/$PATIENT_ID&code=8867-4&_summary=count" | node -e "const b=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(b.total ?? 0)")
COND_COUNT=$(curl -s "$FHIR_BASE/Condition?patient=$PATIENT_ID&_summary=count" | node -e "const b=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(b.total ?? 0)")
MED_COUNT=$(curl -s "$FHIR_BASE/MedicationRequest?patient=$PATIENT_ID&_summary=count" | node -e "const b=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(b.total ?? 0)")

echo "  John Doe heart rate observations: $OBS_COUNT (expected >= 4)"
echo "  John Doe conditions:              $COND_COUNT (expected 3)"
echo "  John Doe medications:               $MED_COUNT (expected 3)"
echo ""
echo "Seed complete."
