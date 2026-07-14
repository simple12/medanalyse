# Vercel Deployment - FHIR Patient App

Deploy the **patient-app** (Vite React UI + FHIR proxy) to Vercel.
The FHIR server itself (HAPI, Medblocks, Epic, Cerner, etc.) runs **externally** - Vercel only hosts the app layer.

> **Live app:** https://fhir-patient-app-five.vercel.app  
> **QA / manual testing:** [TESTING.md](./TESTING.md)  
> **Local / Docker:** see [README.md](./README.md) and [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## Live app

**Production:** https://fhir-patient-app-five.vercel.app

Find deployments under **Project → Deployments** in the [Vercel dashboard](https://vercel.com/dashboard).
Import this repository from your GitHub account when creating the project - do not hard-code org or team names in docs committed to git.

---

## Architecture on Vercel

```text
Browser  →  Vercel (HTTPS)
              ├── client/dist          (static React app)
              ├── /api/fhir/*          (serverless FHIR proxy → api/fhir.ts)
              ├── /api/fhir-sources   (list selectable FHIR sources)
              ├── /api/auth/smart/*   (Cerner/Epic SMART OAuth)
              └── /api/config          (active source label for header)
                    ↓
              External FHIR server (FHIR_BASE_URL)
```

- The browser **never** talks to the FHIR server directly.
- `FHIR_ACCESS_TOKEN` stays server-side only (Vercel encrypted env var).
- HAPI + PostgreSQL **cannot** run on Vercel - use an external FHIR endpoint.

---

## Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (Production, and Preview if desired).

| Variable | Required | Example | Notes |
|----------|----------|---------|--------|
| `FHIR_BASE_URL` | **Yes** | `https://fhir.medblocks.com/fhir/YOUR_TENANT_ID` | Base URL of your FHIR R4 server (no trailing slash required) |
| `FHIR_ACCESS_TOKEN` | If FHIR requires auth | *(JWT or bearer token)* | Sent as `Authorization: Bearer …` by the proxy. **Never commit to git.** |
| `FHIR_SOURCE_LABEL` | No | `Medblocks`, `Epic`, `Cerner` | Custom label shown in the header. If unset, inferred from hostname (see below). |
| `FHIR_SOURCES_JSON` | No | *(JSON array)* | Optional full multi-source registry (overrides defaults below) |
| `HAPI_FHIR_BASE_URL` | No | `https://hapi.fhir.org/baseR4` | HAPI source when using the in-app selector |
| `CERNER_CLIENT_ID` / `CERNER_CLIENT_SECRET` | For Cerner SMART | | Set manually **or** via in-app setup (see below) |
| `CERNER_ISSUER` | For Cerner | Cerner sandbox FHIR base URL | SMART issuer / audience |
| `EPIC_CLIENT_ID` / `EPIC_CLIENT_SECRET` | For Epic SMART | | Set manually **or** via in-app setup (see below) |
| `EPIC_ISSUER` | For Epic | Epic sandbox FHIR base URL | SMART issuer / audience |
| `VERCEL_TOKEN` | For in-app Cerner/Epic setup | *(Vercel API token)* | Lets the app save SMART credentials to Vercel env and redeploy. **Server-side only.** |
| `VERCEL_PROJECT_ID` | Auto on Vercel | | Injected on deployments; required with `VERCEL_TOKEN` |
| `VERCEL_TEAM_ID` | If team project | | Optional team scope for Vercel API |
| `SMART_SETUP_SECRET` | No | *(random string)* | If set, required as `X-Setup-Secret` to update credentials after first setup |
| `SMART_SESSION_SECRET` | Recommended | *(random string)* | Signs SMART session cookies |
| `APP_BASE_URL` | Recommended | `https://fhir-patient-app-five.vercel.app` | OAuth redirect base (auto-detected on Vercel if unset) |

### Do **not** set on Vercel

| Variable | Why |
|----------|-----|
| `FHIR_CONFIG_PATH` | No file mounts on Vercel - use env vars |
| `FHIR_WAIT` | Only for Docker / local Express startup |
| `PORT` | Injected by Vercel |
| `VITE_API_BASE` | Leave empty - client uses same-origin `/api/fhir` |

### Source label (header)

The app shows **Source: …** under “FHIR R4 Patient Administration”. Auto-detection from `FHIR_BASE_URL` hostname:

| Host contains / equals | Label shown |
|--------------------------|-------------|
| `hapi.fhir.org` | Public HAPI Sandbox |
| `medblocks` | Medblocks |
| `epic` | Epic |
| `localhost` / `127.0.0.1` | Local HAPI |
| *(anything else)* | Raw hostname (e.g. `fhir.cerner.com`) |

Override with `FHIR_SOURCE_LABEL` for providers like Cerner that are not auto-mapped.

### Example configurations

**Public HAPI sandbox (read-only demo):**

```bash
FHIR_BASE_URL=https://hapi.fhir.org/baseR4
# FHIR_ACCESS_TOKEN=   (leave unset)
```

**Medblocks (or similar authenticated provider):**

```bash
FHIR_BASE_URL=https://fhir.medblocks.com/fhir/YOUR_TENANT_ID
FHIR_ACCESS_TOKEN=your_jwt_or_bearer_token
FHIR_SOURCE_LABEL=Medblocks   # optional; auto-detected from hostname
```

**Epic / Cerner (in-app setup - recommended):**

Cerner and Epic always appear in the source selector.
Select one, enter **Client ID**, **Client secret**, and **FHIR issuer URL** in the dialog.
The app saves them to Vercel encrypted env vars and triggers a production redeploy (usually 1-2 minutes).

One-time server setup for this automation:

```bash
VERCEL_TOKEN=your_vercel_api_token    # https://vercel.com/account/tokens
# VERCEL_PROJECT_ID is auto-injected on Vercel
# VERCEL_TEAM_ID=...                  # only for team projects
SMART_SESSION_SECRET=random_string
APP_BASE_URL=https://your-project.vercel.app
```

Register OAuth redirect URI in Cerner Code / Epic App Orchard:

`https://your-project.vercel.app/api/auth/smart/callback`

**Cerner Code Console (EHR launch from sandbox):**

Register the app **Launch URI** as the app root (both work):

- `https://your-project.vercel.app/`
- `https://your-project.vercel.app/api/auth/smart/launch`

When a clinician launches from Code Console → **Test Sandbox**, Cerner opens your app with `?iss=…&launch=…`.
The app immediately redirects into SMART OAuth with the `launch` scope and, on success, lands on `/patient/{id}` for the launched patient.

Cerner sandbox test patients (password for all: `Cerner01`):

| Code Console pick | Sign in as | Notes |
|-------------------|------------|--------|
| Wilma Smart | `wilma_smart` | Direct patient login |
| Timmy Smart | `timmy_smart` | Direct patient login |
| Timmy Smart | `nancy_smart` | Proxy - select Timmy if prompted |

**Important:** Launch tokens are **single-use**.
Always start a fresh launch from Code Console for each test.
The patient selected in Code Console must match the portal account you sign in with (otherwise Cerner returns `mismatched-identity`).

**Epic App Orchard (SMART sandbox):**

1. Create an app at [fhir.epic.com](https://fhir.epic.com/) (Non-Production). **Save** the app after each change; sandbox sync can take **~30 minutes**.
2. Set **Endpoint URI** (OAuth redirect) to:

   `https://your-project.vercel.app/api/auth/smart/callback`

3. Enable **Incoming APIs** (R4). Minimum set for this app:

   | API | Used for |
   |-----|----------|
   | `Patient.Read (R4)` | Demographics |
   | `Observation.Read (Vital Signs) (R4)` + `Observation.Search (Vital Signs) (R4)` | Vitals / BP chart |
   | `Observation.Read (Labs) (R4)` + `Observation.Search (Labs) (R4)` | Lab results (e.g. HbA1c) |
   | `Condition.Read (Problems) (R4)` + `Condition.Search (Problems) (R4)` | Conditions table |
   | `MedicationRequest.Read (R4)` | Medications list |
   | `Medication.Read (R4)` | Resolve drug names (not raw `Medication/…` IDs) |

   Epic uses category-based Observation search (`patient` + `category=vital-signs` / `laboratory`), not `subject=Patient/…`.

4. Copy the **Non-Production Client ID** into the in-app setup dialog or `EPIC_CLIENT_ID`. Leave client secret blank for public PKCE apps.
5. After in-app credential save, wait for Vercel redeploy (**~1-2 min**). If Epic still shows “Setup required”, run `vercel deploy --prod` or hard-refresh.

**EHR launch (Epic SMART harness):**

| Field | Value |
|-------|--------|
| Launch URL | `https://your-project.vercel.app/` |
| Redirect URI (app registration only) | `https://your-project.vercel.app/api/auth/smart/callback` |

Do **not** put the callback URL in the harness **Launch URL** field.

**Verified sandbox patients** (harness or MyChart):

| Patient | Notes |
|---------|--------|
| Derrick Lin | BP vitals, conditions, medications (e.g. aspirin 325 MG tablet) |
| Camila Maria Lopez | MyChart `fhircamila` / `epicepic1`; BP + HbA1c, PCOS, meds |

**Standalone launch:** Select Epic → Sign in → authorize in MyChart. Patient list shows the authorized patient only.

Epic sandbox accounts: [open.epic.com/MyChart/Accounts](https://open.epic.com/MyChart/Accounts)

**Epic / Cerner (manual env vars):**

```bash
CERNER_CLIENT_ID=...
CERNER_CLIENT_SECRET=...
CERNER_ISSUER=https://fhir-ehr-code.cerner.com/r4/...
# or EPIC_CLIENT_ID / EPIC_CLIENT_SECRET / EPIC_ISSUER
```

---

## First-time setup (Vercel Dashboard)

1. Go to [vercel.com/new](https://vercel.com/new) and import **this repository** from your GitHub account.
2. Project settings:
   - **Root Directory:** `.` (repo root - **not** `client/`)
   - **Framework Preset:** Vite (or Other)
   - **Build Command:** `npm ci --prefix client && npm run build --prefix client`
   - **Output Directory:** `client/dist`
3. Add environment variables (**before** or right after first deploy):
   - `FHIR_BASE_URL`
   - `FHIR_ACCESS_TOKEN` (if needed)
   - `FHIR_SOURCE_LABEL` (optional)
4. Deploy. Pushes to `main` auto-deploy when GitHub is connected.

---

## Deploy from CLI

### Prerequisites

```bash
npm i -g vercel
vercel login
```

### One-command deploy (script)

From the repo root:

```bash
cd /path/to/fhir_patient_app

export FHIR_BASE_URL=https://fhir.medblocks.com/fhir/YOUR_TENANT_ID
export FHIR_ACCESS_TOKEN=your_token          # optional
export FHIR_SOURCE_LABEL=Medblocks         # optional

npm run deploy:vercel
```

The script links the project, sets env vars on Production, deploys, and smoke-tests the proxy.

### Manual CLI steps

```bash
cd /path/to/fhir_patient_app
vercel link

# Add env vars (paste value when prompted)
vercel env add FHIR_BASE_URL production
vercel env add FHIR_ACCESS_TOKEN production
vercel env add FHIR_SOURCE_LABEL production

vercel deploy --prod
```

After changing env vars, redeploy so functions pick up new values:

```bash
vercel deploy --prod
```

### Agent LLM provider / model (request-time; no redeploy)

API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, …) stay in Vercel env and still need a redeploy when first added or rotated.
Provider and model selection do **not**: they are stored in Upstash Redis / Vercel KV and read on each ask.
Env `LLM_PROVIDER` / `*_MODEL` are optional fallbacks when KV is empty; keep `AGENT_SETTINGS_SECRET` for PUT auth.

- Spec decision: [AGENT_SPEC.md](./AGENT_SPEC.md) section 10 (request-time KV config) and section 11.
- Operators: [TESTING.md](./TESTING.md#agent-llm-provider-no-redeploy) (`GET`/`PUT /api/agent/llm-settings`).
- Laptop OpenAI smoke test: `python3 scripts/test_openai_key.py` (chat + embeddings).
- Env names: [.env.example](./.env.example) (`KV_REST_API_*`, `AGENT_SETTINGS_SECRET`).

### GraphRAG (Postgres + pgvector)

Ask retrieval prefers Neon Postgres (`DATABASE_URL` / `POSTGRES_URL`) with `pgvector` chunk embeddings (`OPENAI_API_KEY` + `text-embedding-3-small`).
That embedding key is required even when Ask phrasing uses Claude or Gemini from KV.
Without the DB or a working OpenAI key, Ask falls back to in-memory FHIR context.
See [AGENT_SPEC.md](./AGENT_SPEC.md) section 9 and [TESTING.md](./TESTING.md#graphrag-ask-postgres--pgvector).

---

## Verify deployment

Replace `APP_URL` with your Vercel URL:

```bash
APP_URL=https://your-project.vercel.app

# App config (source label)
curl -s "$APP_URL/api/config"

# FHIR metadata via proxy
curl -s "$APP_URL/api/fhir/metadata" | head -c 300

# Patient search (requires auth if your FHIR server does)
curl -s "$APP_URL/api/fhir/Patient?_count=2" | head -c 300
```

Browser checklist:

- [ ] App loads; header shows **Source: …**
- [ ] Patient list loads (HAPI + Medblocks)
- [ ] Patient detail page (`/patient/{id}`) loads
- [ ] DevTools Network tab shows only `/api/fhir/*` and `/api/config` - not raw FHIR URL or token
- [ ] Cerner EHR launch from Code Console lands on the correct patient after OAuth
- [ ] Epic harness launch lands on patient details with vitals, conditions, readable medication names

Full QA scripts: [TESTING.md](./TESTING.md)

---

## Cerner EHR launch (Code Console)

1. In [Cerner Code Console](https://code.cerner.com/), open your registered app.
2. Set **Launch URI** to `https://your-project.vercel.app/` (or `/api/auth/smart/launch`).
3. Set **Redirect URI** to `https://your-project.vercel.app/api/auth/smart/callback`.
4. Click **Test Sandbox**, pick a patient (e.g. Wilma Smart or Timmy Smart), and launch.
5. Sign in on Cerner’s portal with the matching sandbox account (see table above).

The in-app **Sign out** button clears this app’s SMART session cookies.
Cerner also keeps its own SSO cookies on `authorization.cerner.com`.
If switching sandbox patients fails with `mismatched-identity` or stale login, sign out, clear site cookies for your Vercel URL **and** Cerner’s auth domain, or use a private browser window, then launch again from Code Console.

Standalone **Sign in with Cerner** from the source selector (without `iss` + `launch`) uses the `launch/patient` scope and is a different flow from Code Console EHR launch.

---

## Local development (unchanged)

Vercel config is for production only.
Local dev still uses Express + Vite:

```bash
npm install && npm install --prefix client && npm install --prefix server
cp .env.example .env
npm run fhir:up          # optional: local HAPI in Docker
npm run dev              # UI :5173, API :3001
```

See [.env.example](./.env.example) for local variables.

---

## Vercel-specific files

| File | Purpose |
|------|---------|
| [vercel.json](./vercel.json) | Build output, SPA rewrites, serverless function config |
| [api/fhir.ts](./api/fhir.ts) | Serverless FHIR proxy |
| [api/config.ts](./api/config.ts) | Returns `fhirSource` label for the UI |
| [scripts/deploy-vercel.sh](./scripts/deploy-vercel.sh) | CLI deploy helper |
| [TESTING.md](./TESTING.md) | QA / manual testing guide (Cerner, Epic, HAPI, Medblocks) |

Express code under `server/` is **not** used on Vercel.
It remains for Docker and `npm run dev`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| 404 on `/api/fhir/Patient/{id}` | Old deploy without path rewrite | Redeploy latest `main` |
| 502 / proxy error | Wrong `FHIR_BASE_URL` or FHIR down | Test URL with `curl`; check firewall |
| 401 on patient list | Missing/expired token | Update `FHIR_ACCESS_TOKEN`; redeploy |
| Header shows wrong source | Host not in auto-map | Set `FHIR_SOURCE_LABEL` |
| UI works, empty list | Read-only sandbox or empty tenant | Use writable FHIR or seed data |
| Env change has no effect | Functions cached old env | `vercel deploy --prod` |
| Cerner `invalid_request` on launch | Reused launch token | Fresh launch from Code Console → Test Sandbox |
| Cerner `mismatched-identity` | Code Console patient ≠ portal login | Match patient to account (Wilma→`wilma_smart`, Timmy→`timmy_smart` or `nancy_smart`) |
| Cerner works for one patient, not another | Stale Cerner SSO or app cookies | Sign out; clear cookies for app + `authorization.cerner.com`; or private window |
| EHR launch opens home, no patient | OAuth failed silently | Check `?smart_error=` in URL; retry from Code Console |
| Epic `Invalid or unconfigured SMART source` | `EPIC_CLIENT_ID` not on live deployment | `vercel deploy --prod` after saving credentials |
| Epic vitals/conditions “missing scope” | APIs not synced or stale token | Add Observation/Condition Search+Read on fhir.epic.com; wait 30 min; sign out & re-auth |
| Epic medication shows `Medication/…` ID | Missing `Medication.Read` | Add API; re-auth |
| Epic harness → JSON error | Wrong launch URL | Use app root `/`, not `/api/auth/smart/callback` |
| In-app Epic setup reloads with no sign-in | Expected after redeploy | Select Epic → **Sign in** |

---

## Security notes

- Share the **app URL only** - not the FHIR server URL or bearer token.
- Use **synthetic / demo data** only in shared environments.
- Rotate tokens if they were exposed in chat or logs.
- Store secrets only in Vercel **Environment Variables**, never in git.
