#!/bin/sh
set -e

# tsc emits under dist/server/src and dist/shared when rootDir is the monorepo parent.
APP_ENTRY="dist/server/src/index.js"

if [ "${FHIR_WAIT:-true}" = "false" ]; then
  echo "Skipping FHIR wait (FHIR_WAIT=false)."
  exec node "${APP_ENTRY}"
fi

FHIR_BASE=$(node -e "
  const fs = require('fs');
  const path = process.env.FHIR_CONFIG_PATH || '/app/config/fhir.json';
  let base = process.env.HAPI_FHIR_BASE_URL || process.env.FHIR_BASE_URL || 'http://hapi-fhir:8080/fhir';
  if (fs.existsSync(path)) {
    try {
      const config = JSON.parse(fs.readFileSync(path, 'utf8'));
      if (config.baseUrl) base = config.baseUrl;
    } catch {}
  }
  process.stdout.write(String(base).replace(/\/$/, ''));
")

FHIR_URL="${FHIR_BASE}/metadata"
echo "Waiting for FHIR server at ${FHIR_URL}..."

until wget -qO- "${FHIR_URL}" > /dev/null 2>&1; do
  sleep 5
done

echo "FHIR server is ready."
exec node "${APP_ENTRY}"
