# Testing guide - FHIR Patient App

For QA and manual testers. Production: **https://fhir-patient-app-five.vercel.app**

Demo / sandbox data only - no real PHI.

---

## Quick smoke test (all sources)

| Step | Expected |
|------|----------|
| Open production URL | App loads; yellow “Demo environment” banner |
| FHIR source dropdown | Shows **HAPI**, **Medblocks**, **Cerner**, **Epic** |
| Select **HAPI** | Status **Ready**; patient list loads (public sandbox) |
| Select **Medblocks** | Status **Connected**; patient list loads |
| Select **Cerner** | Status **Sign in required** or **Connected** (if configured) |
| Select **Epic** | Status **Sign in required** or **Connected** (if configured) |
| Open a patient → Details | Demographics, vitals, conditions, medications sections render |

---

## HAPI (no login)

1. Source selector → **HAPI**
2. Patient list should populate from the public sandbox
3. **New Patient**, **Edit**, **Delete**, and **Search** are enabled
4. Patient details: vitals chart/table, conditions table, medications table

---

## Medblocks (pre-configured token)

1. Source selector → **Medblocks**
2. Patient list loads using server-side credentials (no user login)
3. Same CRUD + search as HAPI

---

## Cerner (SMART OAuth)

### Prerequisites (already on production)

- `CERNER_CLIENT_ID`, `CERNER_ISSUER` set on Vercel (or configured via in-app setup dialog)
- Cerner Code Console app with redirect URI:  
  `https://fhir-patient-app-five.vercel.app/api/auth/smart/callback`
- Launch URI: `https://fhir-patient-app-five.vercel.app/` (or `/api/auth/smart/launch`)

### EHR launch (recommended for patient context)

1. [Cerner Code Console](https://code.cerner.com/) → your app → **Test Sandbox**
2. Pick a patient in the modal, then launch
3. Sign in with the **matching** portal account:

| Code Console patient | Username | Password |
|---------------------|----------|----------|
| Wilma Smart | `wilma_smart` | `Cerner01` |
| Timmy Smart | `timmy_smart` | `Cerner01` |
| Timmy Smart (proxy) | `nancy_smart` | `Cerner01` |

4. Expect redirect to `/patient/{id}` with that patient’s data
5. Patient list shows **one** patient (portal mode - no search/create/delete)

### Cerner pitfalls

| Issue | What to do |
|-------|------------|
| `mismatched-identity` | Code Console patient ≠ portal login; start fresh from Test Sandbox |
| `invalid_request` | Launch token reused - always launch again from Code Console |
| Wrong patient after switch | Sign out; clear cookies for app + `authorization.cerner.com`; or private window |
| Conditions slow / timeout | Cerner sandbox latency; refresh patient details |

---

## Epic (SMART OAuth)

### Prerequisites (already on production)

- `EPIC_CLIENT_ID`, `EPIC_ISSUER` on Vercel (or in-app setup dialog)
- App registered at [fhir.epic.com](https://fhir.epic.com/) (Non-Production)
- **Endpoint URI (redirect):**  
  `https://fhir-patient-app-five.vercel.app/api/auth/smart/callback`
- **Incoming APIs (minimum):**  
  `Patient.Read (R4)`, `Observation.Read (Vital Signs) (R4)`, `Observation.Search (Vital Signs) (R4)`, `Observation.Read (Labs) (R4)`, `Observation.Search (Labs) (R4)`, `Condition.Read (Problems) (R4)`, `Condition.Search (Problems) (R4)`, `MedicationRequest.Read (R4)`, `Medication.Read (R4)` (for drug names)
- After saving app changes on fhir.epic.com: wait **~30 minutes**, then **Sign out** and launch again

### EHR launch (Epic SMART harness)

On fhir.epic.com → **Build Apps** → your app → **Test** (SMART on FHIR harness):

| Field | Value |
|-------|--------|
| App | `patient app - v1` (your app name) |
| MyChart user | e.g. **Derrick Lin** or **Camila Lopez** |
| **Launch URL** | `https://fhir-patient-app-five.vercel.app/` |
| Redirect URI (in app settings only) | `https://fhir-patient-app-five.vercel.app/api/auth/smart/callback` |

Click **Launch** (not “Generate URL Only”).

### Standalone MyChart sign-in

1. Source selector → **Epic** → **Sign in**
2. Or use MyChart sandbox accounts from [open.epic.com/MyChart/Accounts](https://open.epic.com/MyChart/Accounts)

Example - **Camila Lopez**:

| Field | Value |
|-------|--------|
| MyChart username | `fhircamila` |
| Password | `epicepic1` |

### Epic test patients (verified on production)

| Patient | Good for |
|---------|----------|
| **Derrick Lin** | Vitals (BP chart), conditions, medications (e.g. aspirin 325 MG tablet) |
| **Camila Maria Lopez** | Vitals (BP + HbA1c labs), conditions (PCOS), medications |

Patient list in Epic mode shows **one** authorized patient (no search/create/delete).

### Epic pitfalls

| Issue | What to do |
|-------|------------|
| `Invalid or unconfigured SMART source` | Epic credentials not on live deploy - wait for Vercel redeploy or hard refresh |
| `missing scope` for vitals/conditions | Add Observation/Condition Search+Read APIs on fhir.epic.com; save; wait 30 min; sign out & re-auth |
| Medication shows “Unknown medication” | Add `Medication.Read (R4)`; re-auth |
| Harness used callback URL as launch URL | Launch URL must be app root `/`, not `/api/auth/smart/callback` |
| In-app setup “Saving…” then nothing | Normal - page reloads after redeploy; select Epic → **Sign in** |

---

## Patient details - what to verify

For any connected SMART source (Cerner/Epic):

- [ ] **Demographics** - name, gender, DOB
- [ ] **Vitals** - chart and table views; BP series for Epic sandbox patients
- [ ] **Conditions** - at least one row when patient has condition data in sandbox
- [ ] **Medications** - human-readable names (not `Medication/e.xxx…` IDs)
- [ ] **Sign out** - returns to disconnected state; can sign in again

For HAPI / Medblocks:

- [ ] Search bar filters patients
- [ ] Create / edit / delete patient flows work

---

## Agent LLM provider (no redeploy)

API keys stay in Vercel env (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`).
Changing or rotating a key still needs a production redeploy so serverless functions pick it up.
Provider and model live in Upstash Redis / Vercel KV and can change without redeploying.
Env `LLM_PROVIDER` / `*_MODEL` are optional fallbacks only when KV has no stored settings.
Keep `AGENT_SETTINGS_SECRET`; it guards writes to `/api/agent/llm-settings`.

1. Connect **Upstash for Redis** to the Vercel project (Storage marketplace) and redeploy **once** so `KV_REST_API_URL` / `KV_REST_API_TOKEN` exist.
2. Set `AGENT_SETTINGS_SECRET` in Vercel env (redeploy once for that secret).
3. Read current settings:

```bash
curl -s https://fhir-patient-app-five.vercel.app/api/agent/llm-settings
```

4. Switch provider/model immediately (examples):

```bash
# Claude (current demo default)
curl -s -X PUT https://fhir-patient-app-five.vercel.app/api/agent/llm-settings \
  -H "content-type: application/json" \
  -H "x-agent-settings-secret: $AGENT_SETTINGS_SECRET" \
  -d '{"provider":"anthropic","model":"claude-sonnet-4-5"}'

# OpenAI
curl -s -X PUT https://fhir-patient-app-five.vercel.app/api/agent/llm-settings \
  -H "content-type: application/json" \
  -H "x-agent-settings-secret: $AGENT_SETTINGS_SECRET" \
  -d '{"provider":"openai","model":"gpt-4o-mini"}'

# Gemini
curl -s -X PUT https://fhir-patient-app-five.vercel.app/api/agent/llm-settings \
  -H "content-type: application/json" \
  -H "x-agent-settings-secret: $AGENT_SETTINGS_SECRET" \
  -d '{"provider":"gemini","model":"gemini-3.5-flash"}'
```

5. Optional: smoke-test an OpenAI key on your laptop before updating Vercel:

```bash
export OPENAI_API_KEY='sk-...'
python3 scripts/test_openai_key.py
```

Expect PASS for both chat (`gpt-4o-mini`) and embeddings (`text-embedding-3-small`).
If laptop PASS but Ask still says the key was rejected, Vercel has a different/stale value - update env and `vercel deploy --prod`.

---

## GraphRAG Ask (Postgres + pgvector)

1. Connect **Neon** to the Vercel project (Storage marketplace) and redeploy **once** so `DATABASE_URL` / `POSTGRES_URL` exist.
2. Keep a valid `OPENAI_API_KEY` on Vercel (embeddings use `text-embedding-3-small` even if Ask phrasing uses Gemini/Claude from KV).
3. Ask a question on a patient.
   The answer badge shows **Retrieval: GraphRAG** when the DB path ran, or **Retrieval: in-memory** as fallback (missing DB, bad OpenAI key, or embed failure).
4. Optional status:

```bash
curl -s "https://fhir-patient-app-five.vercel.app/api/agent/graph-status?patientId=PATIENT_ID" \
  -H "Cookie: <smart-session>"
```

Token notes: LLM and embedding calls use `maxRetries: 0` (no triple retry on overload).
Graph sync is at most hourly per patient and re-embeds only chunks whose text changed.
Ask prompts truncate chart context (~4.5k chars) and cap completion tokens.

---

## Journey B1 interaction check (in-app order draft)

On Epic/Cerner patient details, use **New medication order**:

1. Pick a proposed drug (curated RxNorm list; ibuprofen is a good test against aspirin charts).
2. Click **Check interactions**.
3. Expect a DDInter-subset card: known interaction, severity, alternatives, or the explicit "no known interaction in this subset" wording (never "safe").
4. **Confirm order** stays disabled until `MedicationRequest.write` is registered on the SMART app.

---

## Reporting issues

Include:

1. **Source** (HAPI / Medblocks / Cerner / Epic)
2. **URL** and patient name or id
3. **Steps** to reproduce
4. Screenshot or exact error text (including `?smart_error=` from URL if present)
5. Browser (Chrome/Safari) and whether private window was used

---

## Related docs

- [AGENT_SPEC.md](./AGENT_SPEC.md) - agent architecture; LLM provider/model is request-time KV config (sections 10-11)
- [vercel_readme.md](./vercel_readme.md) - deployment, env vars, developer setup
- [RELEASES.md](./RELEASES.md) - v1.0.0 release index
- [DEPLOYMENT.md](./DEPLOYMENT.md) - local + Vercel overview
