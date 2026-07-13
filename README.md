# FHIR Patient Management App

Web app for FHIR R4 patient administration: list, search, create, edit, copy, delete, and patient details (vitals, conditions, medications) via a server-side proxy.

**Production:** https://fhir-patient-app-five.vercel.app  
**Release:** [v1.0.0](./RELEASES.md)  
**QA:** [TESTING.md](./TESTING.md)

## Features

- Patient list with search and extended demographics
- Create / edit form with Zod validation
- Patient details at `/patient/{id}` (vitals chart or table, conditions, medications)
- Copy patient + linked resources as a FHIR Bundle to the clipboard
- Cascade delete of Observations, Conditions, and MedicationRequests
- Header source selector: HAPI, Medblocks, Cerner, Epic
- Cerner / Epic SMART OAuth (standalone and EHR launch)

## Stack

- **UI:** Vite, React, TypeScript, React Router, Recharts, Tailwind, shadcn/ui
- **Production API:** Vercel serverless (`api/`)
- **Local API:** Express (`server/`) for `npm run dev` and Docker
- **Local FHIR:** HAPI FHIR R4 via Docker Compose

## Prerequisites

- Node.js 20+
- Docker and Docker Compose (local HAPI / full stack)

## Quick start (Docker)

```bash
npm run docker:up
npm run seed:clinical
```

| Service | URL |
|---------|-----|
| App | http://localhost:3002 |
| HAPI FHIR | http://localhost:8082/fhir |

Stop with `npm run docker:down`.

First HAPI startup can take a few minutes.
Use `docker compose logs -f patient-app` to watch progress.

`npm run seed:clinical` loads five synthetic patients with vitals, conditions, and medications (idempotent).

## Local development

```bash
npm install
npm install --prefix client
npm install --prefix server
cp .env.example .env
npm run fhir:up
npm run seed:clinical   # optional
npm run dev
```

- UI: http://localhost:5173
- API: http://localhost:3001/api/fhir

Vite proxies `/api` to Express.
See [.env.example](./.env.example) for SMART and multi-source variables.

## npm scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Vite + Express |
| `npm run build` | Client + server build |
| `npm run docker:up` / `docker:down` | Full local stack |
| `npm run fhir:up` | HAPI + Postgres only |
| `npm run seed:clinical` | Demo clinical data into local HAPI |
| `npm run deploy:vercel` | Vercel CLI deploy helper |

## Deployment

| Environment | Approach |
|-------------|----------|
| Production | Vercel - [vercel_readme.md](./vercel_readme.md) |
| Local Docker | `npm run docker:up` |
| Local app + Docker FHIR | `npm run fhir:up` then `npm run dev` |

Full guide: [DEPLOYMENT.md](./DEPLOYMENT.md).

## Project structure

```
client/     React UI
api/        Vercel serverless (FHIR proxy, SMART, config)
server/     Express (local + Docker)
shared/     FHIR source registry + SMART helpers
config/     Optional JSON for Docker startup FHIR wait URL
seed/       Generated demo clinical bundle
scripts/    Seed + Vercel deploy helpers
```

## Related docs

| Doc | Purpose |
|-----|---------|
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Local vs Vercel architecture and steps |
| [vercel_readme.md](./vercel_readme.md) | Env vars, SMART setup, Vercel troubleshooting |
| [TESTING.md](./TESTING.md) | Manual QA on production sources |
| [PRD.md](./PRD.md) | Product requirements and acceptance criteria |
| [RELEASES.md](./RELEASES.md) | Version tags |

## License

Private / project use.
