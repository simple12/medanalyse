# Medication Intelligence Agent - Draft Spec

**Status:** Active - Phase 1 Journeys A and C are in progress in this repo.
Journey A (condition-control review + Patient Intelligence card) has a working deterministic engine, `/api/agent/review`, and UI on Epic/Cerner patient details.
Journey C (`POST /api/agent/ask`) uses in-memory chart retrieval with optional LLM phrasing via the Vercel AI SDK when `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` is set.
Provider and model selection are stored in Vercel KV / Upstash Redis (`GET`/`PUT /api/agent/llm-settings`) so swaps do not need a redeploy; env vars remain the key store and the fallback when KV is empty.
Postgres/pgvector GraphRAG, Journeys B, DDInter, and CDS Hooks are not built yet.
This document remains the source of truth; expect it to change as we iterate.

### Decisions locked in this revision

These were open questions in the first draft and are now settled (see [10. Decisions and remaining questions](#10-decisions-and-remaining-open-questions) for detail):

1. Order-check delivery uses **CDS Hooks**, not a generic webhook.
2. The Agent Service ships as **TypeScript functions on Vercel**, added to the existing `api/` project - not a separate GCP container. All state lives in an external database, so the compute is stateless and fits Vercel's serverless model. See [4. High-level architecture](#4-high-level-architecture).
3. Drug interaction data uses **DDInter (free)**. NLM's interaction API is retired and no commercial license will be purchased.
4. The **LLM is pluggable** - any model behind a configurable provider interface, no vendor committed. In TypeScript this is the Vercel AI SDK. See [11. Agentic stack](#11-agentic-stack).
5. CDS Hooks vendor registration is deferred to its **own later phase**.
6. Regulatory posture is **MVP / synthetic-data only** for now; production-PHI clearance is out of scope until later.
7. **Scope change from the PRD:** the physician will eventually place medication orders **from inside this app**. This reopens the PRD's "no clinical writes from the UI" non-goal; see [2. Scope](#2-scope) and [Journey B](#journey-b-order-time-interaction-check).

## 1. Problem statement

Today the app (see [PRD.md](./PRD.md)) is a read-only FHIR viewer.
A physician picks a FHIR source (HAPI, Medblocks, Cerner, or Epic) in the [FhirSourceSelector](./client/src/components/FhirSourceSelector.tsx) and opens a patient on the [PatientDetailsPage](./client/src/pages/PatientDetailsPage.tsx), which shows demographics, vitals, conditions, and medications pulled straight from FHIR.
There is no interpretation of that data today.

We want to add an agent that:

1. Reviews a patient's medication history and current conditions and judges whether the condition is under control.
2. If the condition is not improving, suggests alternate medications with evidence behind the suggestion.
3. When the physician places a new medication order, checks it against the patient's current medication list for interactions and suggests evidence-based alternatives if a problem is found.
4. Learns the patient over time by turning fetched FHIR resources into a per-patient knowledge graph, and answers physician questions about that patient using retrieval-augmented generation (RAG) over the graph.
5. Is callable from the current app via an API call, and we want to explore webhooks as the delivery mechanism for the resulting "patient card."

This document proposes an architecture, API surface, data model, and phased rollout.
It does not include code; it is meant to be reviewed and revised before implementation starts.

## 2. Scope

### In scope (this spec)

- Trigger points, API contracts, data model, and knowledge graph / RAG design for the agent.
- How the agent is invoked from the existing app when Epic or Cerner is the active source.
- How webhooks / CDS Hooks fit the "physician places an order" flow.
- Security and compliance constraints specific to sending PHI to an agent that calls an LLM and external drug data sources.

### Scope change from the PRD: in-app medication ordering

The PRD lists "Writing Observations / Conditions / MedicationRequests from the UI" as a non-goal.
This spec **deliberately reopens the MedicationRequest part of that non-goal**: the physician will eventually be able to place a medication order from inside this app, with the agent's interaction check running against the draft order before it is submitted (see [Journey B](#journey-b-order-time-interaction-check)).
This is a conscious change, called out here rather than buried.
Consequences:

- The app gains a "new medication order" flow that creates a `MedicationRequest` against the active FHIR source (Epic/Cerner), which requires **write scopes** (`patient/MedicationRequest.write` or `user/MedicationRequest.write`) that today's read-only SMART registration does not request.
- The interaction check becomes primarily an **in-app, pre-submit** step (synchronous, via `POST /api/agent/interaction-check`). CDS Hooks then covers the complementary case where the physician places the order **natively in Epic/Cerner** instead of in our app.
- Observations and Conditions remain read-only. Only MedicationRequest writes are in scope.

### Out of scope (for now)

- Writing Observations or Conditions from the UI (unchanged from the PRD; only MedicationRequest writes are added).
- HAPI and Medblocks sources. The request specifically ties the agent to the Epic/Cerner dropdown selection, and those are the sources with realistic EHR-native medication and condition data. HAPI/Medblocks can be added later if useful for demos.
- Any commercial/licensed drug interaction database. Decided: DDInter (free) only - see [8. Evidence sources](#8-evidence-sources).
- FDA regulatory clearance work. MVP / synthetic data only for now; flagged as a governance item, not solved here.
- Production PHI processing (see [11. Security and compliance](#11-security-and-compliance)).

## 3. User journeys

### Journey A: passive condition-control review

1. Physician selects "Epic" or "Cerner" in the source selector and opens a patient.
2. The app calls the agent in the background with the patient id and source id.
3. The agent pulls the patient's Condition, MedicationRequest, MedicationStatement, and relevant Observation history, and Encounter history, over FHIR.
4. The agent decides, per active condition, whether it is controlled, worsening, or improving, using condition-specific marker trends (e.g., blood pressure trend for hypertension, HbA1c trend for diabetes).
5. If a condition looks uncontrolled, the agent proposes alternate medication options with rationale and citations.
6. The result renders as a "Patient Intelligence" card on the patient details page. Nothing is applied automatically; the physician reviews and acts (or ignores it) in their own EHR.

### Journey B: order-time interaction check

There are two entry points to the same check, because the physician can place an order either inside our app or natively in the EHR.

**B1 - order placed inside our app (primary path):**

1. Physician opens the "new medication order" flow on the patient page and picks a drug.
2. Before the order is submitted, the app calls `POST /api/agent/interaction-check` with the draft medication.
3. The agent compares the proposed medication against the patient's active medication list and allergies.
4. If an interaction is found, the app shows a card with the interaction, its severity, and evidence-based alternative(s) in the same therapeutic class - inline, before the physician confirms.
5. The physician either changes the order or confirms; on confirm, the app writes the `MedicationRequest` to the active FHIR source. Nothing is auto-changed by the agent.

**B2 - order placed natively in Epic/Cerner (complementary path, via CDS Hooks):**

1. Physician places a new medication order inside Epic or Cerner.
2. The EHR invokes our CDS Hooks service (`order-select` / `medication-prescribe`) with the draft MedicationRequest.
3. Same comparison as B1.
4. The agent returns a CDS Hooks Card with the interaction, severity, and alternatives, rendered in the physician's native ordering workflow.

### Journey C: ask a question about this patient

1. Physician opens the Patient Intelligence panel and types a question, e.g. "Has her blood pressure improved since we added lisinopril?"
2. The RAG layer retrieves the relevant slice of the patient's knowledge graph (and any narrative text available, such as DiagnosticReport or DocumentReference content) and answers with citations back to the underlying FHIR resources.

## 4. High-level architecture

```
Browser (existing React app)
   |
   |  existing: /api/fhir/*    (FHIR proxy, unchanged)
   |  new:      /api/agent/*    (agent endpoints, same Vercel project)
   |  new:      /cds-services/* (public CDS Hooks endpoints, later phase)
   v
Vercel functions (api/) - TypeScript
   |-- existing FHIR proxy + SMART (unchanged)
   |-- Agent endpoints (new):
   |     |-- FHIR reader           (reuses shared/ connection resolution + read-only scopes)
   |     |-- Condition-control engine
   |     |-- Interaction-check engine
   |     |-- Knowledge graph builder + RAG retriever
   |     +-- LLM calls via pluggable provider (see section 11)
   |
   v
External state + evidence
   +-- Postgres + pgvector (graph tables + embeddings; section 9)
   +-- evidence sources (RxNorm, openFDA, DailyMed, DDInter, guideline corpus; section 8)
   +-- LLM provider (configurable via Vercel AI SDK; section 11)
```

**Hosting (decided): TypeScript functions on Vercel, in the existing `api/` project - not a separate service.**

The first draft argued the agent needed to be a separate stateful component. That objection was resolved by a later decision: all state (knowledge graph, embeddings, run status) lives in an external database, not in process. Once the compute holds no state, it fits Vercel's serverless model directly, so there is no reason to stand up a separate GCP container. The agent becomes additional TypeScript routes alongside the existing FHIR proxy, reusing `shared/` connection resolution and the same deploy pipeline.

What this buys us:

- One language (TypeScript), one deployment, one repo. No cross-service auth between our backend and a separate agent host.
- Reuse of the existing SMART connection model in [resolve-fhir-connection.ts](./server/src/lib/resolve-fhir-connection.ts) instead of re-plumbing credentials into another service.
- Secrets via Vercel environment variables / project settings, same as the current app.

What to keep an eye on (serverless tradeoffs, none blocking for Phases 1-2):

- **Function duration.** The condition review targets under ~10s (section 13); Vercel Pro functions allow a configurable `maxDuration` well above that, so for the MVP the review can run **synchronously** and we can drop the queued-job/`runId` polling machinery entirely (see the simplification note in section 6). Hobby-tier duration limits are tighter, so a Pro plan is assumed.
- **CDS Hooks cold starts.** The `/cds-services/*` order-select budget is sub-second to a few seconds (Phase 3). Serverless cold starts are the one place this model is a mild liability; mitigations (keep the function warm, return a fast "loading" card) are noted when we get to that phase, and it does not affect Phases 1-2.
- **Heavy background monitoring** (FHIR Subscriptions, Phase 4) is the weakest fit for pure serverless. If periodic re-checks get heavy, that phase can add a Vercel Cron job or a small dedicated worker then - decided when we reach it, not now.

Local development stays as-is: the `server/` Express app already mirrors the `api/` routes for `npm run dev`, so the agent routes get the same treatment.

## 5. Trigger points

| Trigger | Where | Behavior |
|---|---|---|
| Source selector set to `epic` or `cerner` | [FhirSourceSelector](./client/src/components/FhirSourceSelector.tsx) / [fhir-source-context](./client/src/lib/fhir-source-context.tsx) | Arms the agent for the session. No patient-level call happens yet because no patient is selected at this point. |
| Patient details page opened while source is `epic` or `cerner` | [PatientDetailsPage](./client/src/pages/PatientDetailsPage.tsx) | Fires the condition-control review (Journey A) automatically, same way the page already fires the vitals/conditions/medications loads. |
| Physician places a medication order in the native EHR | Epic/Cerner, not our app | Fires the interaction check (Journey B) via CDS Hooks or webhook. |
| Physician asks a free-text question | New panel on patient details page | Fires the RAG Q&A (Journey C), on demand. |

Note: the condition-control review and the Q&A panel only make sense once a patient is open, so the actual API call happens on the patient details page, gated by `sourceId === "epic" || sourceId === "cerner"`.
The dropdown selection event itself just determines whether the UI shows the Patient Intelligence panel at all.

## 6. In-app API (Phase 1)

New routes in the same Vercel project, alongside the existing `/api/fhir` proxy.
Same auth model as today: the browser calls our own backend routes, which attach the resolved SMART connection (see [resolve-fhir-connection.ts](./server/src/lib/resolve-fhir-connection.ts)) before doing any FHIR read. FHIR credentials never reach the browser.

**Simplification enabled by the Vercel + synchronous decision.**
Because the review targets under ~10s and Vercel Pro functions allow a `maxDuration` well above that, the MVP runs the review **synchronously** and returns the card in the response. That drops the `runId` / job-queue / polling / SSE machinery the first draft proposed - none of it is needed until an analysis genuinely exceeds the function budget. We still persist an `AgentRun` record for the audit trail (section 12), but the client does not have to poll for it. The streaming/job endpoints are noted below as a **later** option, not part of Phase 1.

Phase 1 endpoints:

- `POST /api/agent/review`
  Body: `{ patientId, sourceId }`.
  Runs the condition-control review (Journey A) synchronously and returns the card(s). Writes an `AgentRun` record as a side effect.

- `POST /api/agent/interaction-check`
  Body: `{ patientId, sourceId, proposedMedication: { rxnormCode, display } }`.
  Synchronous pre-submit check for Journey B1 (order placed inside our app). Returns interaction findings and alternatives directly, no job needed, because the scope is narrow enough to bound the latency. Called before the app writes the MedicationRequest; the same engine also backs the CDS Hooks path (B2) for orders placed natively.

- `POST /api/agent/ask`
  Body: `{ patientId, sourceId, question }`.
  RAG Q&A (Journey C). Returns `{ answer, citations: [{ resourceType, id, excerpt }] }`. May stream tokens back using the Vercel AI SDK's streaming response, since answers are free text.

**Deferred to a later phase, only if needed:** an async job model (`POST /api/agent/reviews` returning a `runId`, `GET /api/agent/runs/:runId`, and an SSE stream) for the case where an analysis outgrows the synchronous function budget. Not built in Phase 1.

All responses that include a recommendation carry:

```json
{
  "recommendation": "...",
  "rationale": "...",
  "evidence": [{ "source": "...", "citation": "...", "url": "..." }],
  "disclaimer": "Decision support only. Verify independently before acting."
}
```

## 7. Delivery mechanism: webhooks vs CDS Hooks

The request asks specifically about webhooks for delivering the "patient card."
Two different problems are being conflated here, worth separating:

**Delivering the result to an already-open browser tab (Journey A, C).**
This does not need a webhook. In the Phase 1 synchronous model the page just awaits the `POST /api/agent/review` response and renders the card - no callback of any kind. If a future analysis outgrows the synchronous budget and moves to the deferred job model (section 6), the result still gets to the waiting page via SSE or polling, not a webhook; a webhook would just mean receiving an HTTP callback and then still having to push it to the browser some other way, so it does not remove a step.

**Reacting to something that happens inside Epic/Cerner, outside our app (Journey B).**
This is where a webhook-shaped mechanism is genuinely the right tool, and there are two standards for it:

- **CDS Hooks** (recommended primary path). This is the actual industry standard for "physician is about to order a medication, show me a card with interaction warnings / alternatives," and both Epic and Cerner support it natively in their sandboxes and in production. Our agent would expose a discovery document and hook endpoints:
  - `GET /cds-services` - lists our hooks.
  - `POST /cds-services/medication-prescribe` (or `order-select`, depending on the EHR's supported hook) - called synchronously by the EHR while the physician is placing the order, must respond fast (Epic's guidance is roughly sub-second for a "loading" card, with a hard timeout in the few-second range).
  - `POST /cds-services/patient-view` - called when the chart opens, could carry the condition-control card directly into the native EHR UI instead of (or in addition to) our own app.
  - The response format is literally called a "Card": summary, indicator (info/warning/critical), detail text, suggestions, and links. This maps directly onto what was asked for as a "patient card," so CDS Hooks is worth treating as the target shape even for the in-app version, so the two paths stay consistent.

- **FHIR Subscriptions (R4 REST-hook)** as a fallback / complement, for asynchronous cases where CDS Hooks does not apply (e.g., nightly or periodic re-check of a patient's labs to catch "condition stopped improving" outside of an order event). Our backend would register a Subscription with the EHR (where the EHR supports outbound subscriptions; Cerner's support is limited and Epic's requires specific configuration), and receive a notification at `POST /api/webhooks/fhir-subscription/:sourceId` when a relevant resource changes, then run the agent and store the result for the physician to see next time they open the patient (or push it if they have the page open, via the SSE stream above).

Ordering: build the **in-app pre-submit check (B1)** first, because the physician will place orders inside our app and that path needs no vendor CDS Hooks registration to work. Add the **CDS Hooks service (B2)** in a later phase for orders placed natively in Epic/Cerner - the interaction engine is shared, so B2 is mostly the CDS Hooks wrapper plus per-vendor registration. Treat FHIR Subscriptions as a still-later addition for background monitoring, not as the primary mechanism. Even for B1 it is worth shaping the in-app card like a CDS Hooks Card (summary, indicator, detail, suggestions, links) so the two paths render consistently.

## 8. Evidence sources

Every recommendation must cite where it came from.
Candidate sources, to be finalized with the user:

- **RxNorm** (NLM) for normalizing medication names/codes and therapeutic class relationships, used to find "same class, no known interaction" alternatives.
- **openFDA** drug label endpoints for interaction and contraindication language pulled from FDA-approved labels.
- **DailyMed** for full structured product labels.
- Drug-drug interaction data: **DDInter 2.0 (decided)**. NLM retired its RxNav Interaction API in January 2024, so that is not available, and no commercial source (First Databank, Medi-Span) will be licensed. DDInter is a free academic dataset; we accept its narrower coverage as an explicit MVP tradeoff. Practically, we ingest the DDInter dataset into the Agent Service's own database and map DDInter drug identifiers to RxNorm codes so interaction lookups line up with the patient's normalized medication list. Because coverage is incomplete, the agent must state when it found **no known interaction** rather than implying the combination is definitively safe.
- A curated set of clinical guideline documents (e.g., ADA, AHA/ACC, JNC) for the "what's the next step if this condition isn't controlled" reasoning, ingested into the RAG corpus described in section 9.

The agent should never present a recommendation without at least one traceable citation, and should say so explicitly if it cannot find supporting evidence rather than guessing.

## 9. Knowledge graph and RAG

### Per-patient knowledge graph

Built from the same FHIR resources the app already fetches, plus a few it does not fetch today (MedicationStatement, MedicationDispense, AllergyIntolerance, Encounter, and narrative text from DiagnosticReport/DocumentReference where present).

Proposed entities: `Patient`, `Condition`, `Medication`, `MedicationRequest`, `Observation`, `Encounter`, `AllergyIntolerance`, `Practitioner`.

Proposed relationships: `Patient -HAS_CONDITION-> Condition`, `Patient -PRESCRIBED-> MedicationRequest -OF-> Medication`, `MedicationRequest -TREATS-> Condition` (inferred from `reasonCode`/`reasonReference` when present, otherwise from RxNorm indication mapping), `Condition -MONITORED_BY-> Observation` (via a LOINC-to-condition marker table, e.g. blood pressure LOINC codes to hypertension), `MedicationRequest -INTERACTS_WITH-> MedicationRequest` (derived edge, written after an interaction check runs), `Encounter -DOCUMENTS-> Condition | Observation`.

Every node and edge is namespaced by `(sourceId, patientId)` so the same synthetic patient id across different sandboxes never collides.

### RAG

Two retrieval paths, combined:

1. **Graph traversal**: given a question, find the relevant entities (e.g., the condition and its medications) and pull their immediate neighborhood out of the graph, serialized to text.
2. **Vector search**: embed narrative text chunks (visit notes, discharge summaries, guideline documents) and retrieve the top matches for the question.

Both get assembled into the LLM's context along with the disclaimer and citation requirement from section 8.
This is the standard "GraphRAG" pattern: graph traversal gives precise structured facts (this patient's actual BP trend), vector search gives supporting narrative and guideline context.

### Storage choice

The Vercel functions are stateless, so the graph and vector store live in an external managed Postgres.

- **MVP choice: Postgres + pgvector**, modeling the graph as node/edge tables. One managed database covers both the graph (node/edge tables) and the embeddings via the `pgvector` extension. Simplest ops, and fine at the scale of "one graph per patient." On Vercel the natural pick is **Vercel Postgres (Neon-backed, supports pgvector)** or Neon/Supabase directly - all serverless-friendly with connection pooling, which matters because serverless functions open many short-lived connections.
- **Later upgrade:** a dedicated graph database (Neo4j Aura, Memgraph) if edge-table traversal in SQL becomes painful. Not a day-one requirement.

Recommendation: start with Vercel/Neon Postgres + pgvector, revisit if traversal queries outgrow it. Use a pooled connection string (Neon's pooler or Prisma Accelerate/similar) so the serverless functions do not exhaust database connections.

## 10. Decisions and remaining open questions

### Decided

1. **Order-check delivery: CDS Hooks** (not a generic webhook) for orders placed natively in the EHR; in-app orders use a synchronous pre-submit check (sections 6, 7).
2. **Agent Service: TypeScript functions on Vercel**, in the existing `api/` project (not a separate GCP container). Enabled by externalizing all state to Postgres; section 4.
3. **Drug interaction data: DDInter (free)**. No commercial license (section 8).
4. **LLM: pluggable / configurable** - any model behind a provider interface, no vendor committed (section 11).
5. **CDS Hooks registration: deferred to its own phase** (phase 2, section 14). Registering with Epic and Cerner is a per-vendor developer-portal process, separate from the SMART app registration already in place for read access.
6. **Regulatory posture: MVP / synthetic-data only** for now. Software that suggests a specific alternate drug sits near the FDA's line for regulated Clinical Decision Support under the 21st Century Cures Act CDS exemption (which broadly requires the clinician be able to independently review the basis for a recommendation). The whole design leans on "explain the rationale, cite evidence, physician confirms independently, no auto-apply" to stay on the right side of that line, but a real regulatory/legal read is required **before** any production use with real patients. Not solved here, deliberately deferred.
7. **In-app ordering: in scope.** The physician will eventually place orders from inside this app; this reopens the PRD's "no clinical writes" non-goal for MedicationRequest only (section 2).

### Remaining open questions

- **Write scopes for in-app ordering.** Placing a MedicationRequest from our app needs `patient/MedicationRequest.write` (or `user/...write`) added to the Epic/Cerner SMART registration and sandbox app config, which today request read scopes only. This is a registration/config change to schedule, not a blocker for the read-only Journeys A and C.
- **Which concrete LLM to run first.** The interface is pluggable (Vercel AI SDK), but we still need to pick a default model to develop and demo against. Even on synthetic data this affects latency and cost.
- **Guideline corpus contents.** Which specific guideline documents (ADA, AHA/ACC, JNC, etc.) we ingest for the condition-control reasoning, and their licensing/redistribution terms.

## 11. Agentic stack

The shape of the work drives this choice more than any framework preference. Looking at the journeys: the condition review (A) is a deterministic branching pipeline with one or two LLM calls; the interaction check (B) is a DDInter lookup plus an LLM for phrasing; only the RAG Q&A (C) is genuinely multi-step. This is structured, auditable pipelines - not an open-ended autonomous agent loop - and the spec's own requirements (every recommendation traceable to a stored `AgentRun`, nothing shown without a citation) reward explicit, inspectable orchestration over framework magic.

Given TypeScript and Vercel are now the platform, the stack is:

- **Language/runtime: TypeScript, in the existing Vercel `api/` project.** No separate service, no second language. Reuses `shared/` connection resolution and the current deploy pipeline.
- **LLM access: the Vercel AI SDK (`ai` package).** This is the pluggable-provider layer - one call signature (`generateText` / `streamText` / `embed`) across OpenAI, Anthropic, Google, and self-hosted/Ollama via swappable provider adapters. It satisfies the "any model behind a configurable interface" decision natively in TS (it is the TS analogue of what LiteLLM would have been in Python). Runtime provider/model selection is stored in Vercel KV / Upstash Redis (`agent:llm-settings`, exposed as `GET`/`PUT /api/agent/llm-settings` guarded by `AGENT_SETTINGS_SECRET`). API keys and the no-KV fallback still use env (`LLM_PROVIDER`, per-provider `*_MODEL`). Swapping models via KV does not touch agent logic or require a redeploy. Streaming (`streamText`) backs the Q&A endpoint.
- **Orchestration: plain, explicit steps for the MVP.** Journeys A and B are simple enough to write as ordinary async functions - fetch, compute, branch, call the model, assemble the card - which keeps every step loggable for the audit trail. No agent framework in Phase 1.
- **Upgrade path (named, not adopted): [LangGraph.js](https://langchain-ai.github.io/langgraphjs/).** Its stateful/checkpointable graph maps onto the `AgentRun` lifecycle and the idempotency/resumability NFRs, and it is provider-agnostic so it does not fight the pluggable-LLM goal. Adopt it the moment orchestration genuinely needs graph state, branching retries, or agentic multi-hop retrieval - most likely first triggered by Journey C's GraphRAG. Structuring the MVP as discrete steps keeps that swap cheap.
- **Deliberately avoided: LangChain's high-level chain abstractions.** Their leaky, churny abstractions fight both the pluggable-LLM requirement and the "every step must be auditable" requirement; we would be debugging the framework instead of the pipeline. (LangGraph, above, is the lower-level state-machine library from the same ecosystem and is a different thing.)

The provider interface is also where the compliance boundary lives: whichever provider is configured for a non-synthetic environment must be one under an appropriate data agreement (see section 12).

## 12. Security and compliance

- No PHI leaves our infrastructure to any third party (LLM, evidence API) without that party being under an appropriate data agreement (BAA or equivalent) for the data involved. This applies the moment we move past purely synthetic sandbox data. The pluggable provider interface (section 11) is where this constraint is enforced - a non-synthetic environment may only be configured with a provider that meets it.
- **Read vs write scopes.** For the read-only journeys (condition review, Q&A) the agent routes use read scopes only. The one write path is the in-app medication order (Journey B1), which needs a MedicationRequest write scope. That write is initiated by the physician's explicit confirm in the UI and executed by our backend, not silently by the agent - the agent only ever *suggests*, and no recommendation is auto-submitted as an order.
- Every agent run is logged with inputs (resource ids, not necessarily full payloads), the recommendation produced, and the evidence cited, so a recommendation can be audited later. This is an `AgentRun` record, see section 13.
- Reuse the existing session/connection model: the agent routes resolve a short-lived, scoped FHIR connection per request the same way [resolve-fhir-connection.ts](./server/src/lib/resolve-fhir-connection.ts) does today, rather than holding long-lived SMART tokens.
- Rate limit and cap the number of agent runs per patient per time window, both for cost control and to avoid hammering the sandbox/production FHIR APIs.

## 13. Data model additions

```
AgentRun {
  id
  patientId
  sourceId
  trigger: "patient-view" | "manual" | "order-check" | "subscription"
  status: "queued" | "running" | "done" | "error"
  createdAt
  completedAt
  result: json
  error: string | null
}

Recommendation {
  id
  agentRunId
  type: "alternate-therapy" | "interaction-alert" | "condition-status"
  medicationCode: string | null
  severity: "info" | "warning" | "critical" | null
  rationale: string
  evidence: [{ source: string, citation: string, url: string | null }]
}
```

Knowledge graph and vector store schemas are described in section 9; they live in the external Postgres, not the app's existing config.

## 14. Non-functional requirements

| Category | Requirement |
|---|---|
| Latency (CDS Hooks) | Respond within the EHR's timeout budget (roughly 1-5 seconds depending on hook and vendor); return a partial/loading card rather than blocking if the full analysis needs longer. Watch serverless cold starts here (section 4). |
| Latency (in-app) | Phase 1 runs the review synchronously inside the function; target under ~10 seconds for a good clinician experience, within the configured Vercel `maxDuration`. |
| Traceability | Every recommendation has a stored `AgentRun` and cited evidence; nothing is presented without a citation. |
| Safety | No recommendation is auto-applied. Every output carries the disclaimer from section 6. |
| Idempotency | Re-running the same review for the same patient/state should be safe to call repeatedly (e.g., from a retry) without duplicating side effects. |

## 15. Phased rollout

- **Phase 1**: in-app, read-only. Condition-control review and Q&A (Journeys A and C) as synchronous `/api/agent/*` TypeScript routes in the existing Vercel project (section 6), against sandbox Epic/Cerner data. Knowledge graph + RAG on Vercel/Neon Postgres + pgvector. Pluggable LLM (Vercel AI SDK) wired to a development model. No writes, no CDS Hooks yet.
- **Phase 2**: in-app medication ordering with pre-submit interaction check (Journey B1). Adds the MedicationRequest write scope to the SMART registration and the "new order" UI. This is the point where in-app write scope gets added.
- **Phase 3**: CDS Hooks service (`/cds-services/*` routes in the same project) for orders placed natively in the EHR (Journey B2), including the per-vendor CDS Hooks registration with Epic and Cerner sandboxes. Address cold-start latency here.
- **Phase 4**: FHIR Subscriptions for background/asynchronous monitoring (may add a Vercel Cron job or small worker), plus revisit production readiness (real PHI) against section 10, particularly LLM data handling and regulatory posture.

## 16. Non-goals (restated)

- No Observation or Condition writes from our own app. MedicationRequest writes **are** now in scope (section 2), a deliberate change from the [PRD](./PRD.md); Observations and Conditions stay read-only.
- No production PHI processing until section 10's remaining questions are resolved (LLM data handling, regulatory read).
- The **drug interaction source, hosting, language, and agentic stack are decided** (DDInter, Vercel + TypeScript, Vercel AI SDK, plain orchestration with LangGraph.js as the named upgrade); the graph database remains an open MVP-vs-later choice (Postgres/pgvector first).
