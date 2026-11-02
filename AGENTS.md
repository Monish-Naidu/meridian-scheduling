# AGENTS.md

## Overview

Demo backend for Meridian Health, a fictional telehealth and patient scheduling SaaS for clinic networks.
It is a TypeScript Express 5 API on SQLite (`better-sqlite3`). It lists clinics and provider availability,
books and cancels appointments while rejecting overlaps for the same provider, and builds pre-visit context
from a mock Epic FHIR client that counts and prices every call. All data is fake.

## Commands

Node 20+. Run from the repo root.

```bash
npm install         # install
npm run dev         # API on http://localhost:3000 with watch mode
npm test            # Vitest, in-memory SQLite, no Epic latency
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm run seed        # wipe and reseed data/meridian.db
```

## Repo map

```
src/
  index.ts            server entry (port, DB path, shutdown)
  app.ts              createApp(): middleware, routers, error handler
  deps.ts             AppDeps: db, epic, logger, now()
  logger.ts           JSON line logger (LOG_LEVEL)
  errors.ts           HttpError and error middleware
  validate.ts         Zod parsing that throws 400s
  db/                 schema, seed data, seeding, repository queries
  domain/slots.ts     pure slot generation (timezone and DST aware)
  domain/appointments.ts  slots, booking with overlap check, cancel
  domain/visit-context.ts  parallel Epic calls for a visit
  epic/               mock Epic client, fixtures, call tags, metrics
  routes/             one Express router per resource
tests/                Vitest suites; helpers.ts builds an app with a fixed clock
.factory/             Droid project hooks (production database guard)
data/                 local SQLite file (gitignored)
```

## Rules

**Time**
- Store all times in UTC (ISO 8601 with `Z`). Convert using the clinic's IANA timezone (`clinics.timezone`)
  with Luxon. Never use the server's local timezone.
- Provider working hours and the `date` query parameter are in clinic-local time.
- Get the current time from `deps.now()`, not `new Date()`, so tests can pin the clock.

**Testing**
- Every bug fix needs a regression test that fails without the fix.
- Run `npm test`, `npm run typecheck` and `npm run lint` before finishing. All three must pass.

**Logging and PHI**
- Use the logger from `src/logger.ts`. Do not use `console.*`.
- Never log patient names, emails, phone numbers or dates of birth, including inside request bodies,
  FHIR resources or error details. Log patient IDs only.

**Epic**
- All Epic calls go through the shared `EpicClient` in `src/epic/`, so every call is counted and tagged.
  Pass `{ visitId }` when a call belongs to a visit.
- New resource types must be added to `EPIC_RESOURCES` and `RESOURCE_TAGS` in `src/epic/types.ts`.
- Caching limits (there is no cache yet; any cache you add must follow these):
  - Practitioner, Location: may be cached for hours.
  - Patient demographics: may be cached for one visit only.
  - AllergyIntolerance, MedicationRequest: never serve from a cache older than 5 minutes.

**Safety**
- Never run commands against production systems or real Epic endpoints.
- `.factory/hooks.json` runs `.factory/hooks/block-prod-db.mjs` before every shell command and blocks
  production database URLs, `PROD` database variables, and database tools aimed at prod. Do not
  bypass or weaken it; extend `tests/block-prod-db-hook.test.ts` when changing it.
- No secrets in code, tests, fixtures or logs. Read configuration from environment variables.
