# FHIR R4 Patient Management App - PRD

**Status:** Complete for v1.0.0.  
**Hosting:** Vercel - https://fhir-patient-app-five.vercel.app  
**Ops:** [DEPLOYMENT.md](./DEPLOYMENT.md), [vercel_readme.md](./vercel_readme.md), [TESTING.md](./TESTING.md)

## 1. Overview

A web Patient Management App that talks to FHIR R4 only through a backend proxy.
Clinicians or admins can list, search, create, edit, copy, and delete patients, and open a details page with demographics, vitals, conditions, and medications.
FHIR credentials stay server-side.

### Goals

- Load patients from a live FHIR R4 server
- Create and update Patient resources with extended demographics
- Search by name via FHIR search parameters
- Show details: vitals time-series, conditions, medications
- Cascade-delete a patient and linked clinical resources
- Copy patient + linked resources as a FHIR Bundle
- Support multiple FHIR sources (HAPI, Medblocks, Cerner, Epic) with SMART for Cerner/Epic
- Clear loading and error feedback
- Local Docker HAPI for development and demos

### Non-goals

- Soft delete
- Bundle pagination beyond FHIR defaults
- Writing Observations / Conditions / MedicationRequests from the UI
- Importing bundles from clipboard
- Offline mode or multi-tenant RBAC
- App login outside SMART sandbox flows for Cerner/Epic

## 2. Use cases

| ID | Use case |
|----|----------|
| UC-1 | View patients on load |
| UC-2 | Search by name |
| UC-3 | Create patient |
| UC-4 | Edit patient |
| UC-5 | Open patient details |
| UC-6 | Review vitals, conditions, medications |
| UC-7 | Delete patient + dependents |
| UC-8 | Copy patient bundle to clipboard |
| UC-9 | Switch FHIR source (including SMART sign-in) |

## 3. Functional summary

- **List:** table with demographics; row selection; header actions; demo banner
- **Search:** FHIR `name` parameter (where the source allows full list search)
- **Form:** create/edit dialog with Zod validation; preserve unedited FHIR fields on update
- **Details:** `/patient/:id` with chart or cross-tab vitals, conditions, medications
- **Delete:** confirm; cascade Observations, Conditions, MedicationRequests; keep Practitioner
- **Copy:** Patient + Practitioner + Observations + Conditions + MedicationRequests as Bundle JSON
- **Sources:** header selector; Cerner/Epic require SMART when configured

## 4. Non-functional

| Category | Requirement |
|----------|-------------|
| Security | Tokens and client secrets server-side only |
| Standards | FHIR R4 JSON |
| Compatibility | FHIR R4 Patient CRUD + clinical reads (source-dependent) |
| Persistence (local) | HAPI + Postgres Docker volume |
| Errors | Surface HTTP status and OperationOutcome text when available |

## 5. Acceptance criteria

- [x] Patients load from the active FHIR source
- [x] Search, create, edit work against writable sources
- [x] Details page shows demographics, vitals, conditions, meds
- [x] Cascade delete and copy-bundle work
- [x] Browser only calls `/api/*` (no direct FHIR credentials)
- [x] HAPI, Medblocks, Cerner, Epic selectable on production
- [x] Cerner and Epic SMART standalone / EHR launch documented and testable
- [x] Docker local stack and `npm run seed:clinical` work
- [x] Docs cover local and Vercel deploy

## 6. Out of scope / later

- Paste/import patient bundles
- Clinical write from the UI
- Synthea bulk import helper
- Field-level OperationOutcome mapping in the form

*Last updated for v1.0.0 - Vercel production, multi-source SMART, local Docker retained.*
