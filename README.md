# meridian-scheduling

Demo backend for **Meridian Health**, a fictional telehealth and patient scheduling SaaS for clinic networks.
It covers clinics in several timezones, provider availability, appointment booking with overlap protection,
and a mock Epic FHIR integration with call metering.

> All data in this repository is fictional. Patient emails use `example.com` and phone numbers use the
> reserved `555-01xx` range. The Epic client is an in-process mock and never calls a real system.

## Stack

Node 20+, TypeScript, Express 5, SQLite (`better-sqlite3`), Luxon for timezones, Zod for validation,
Vitest + Supertest for tests.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000, reloads on change
```

On first start the database is created at `data/meridian.db` and seeded with 3 clinics, 6 providers and
10 patients.

| Script | Purpose |
|---|---|
| `npm run dev` | Start the API with watch mode |
| `npm start` | Start the API without watch mode |
| `npm run seed` | Wipe all data (including appointments) and reseed |
| `npm test` | Run the Vitest suite (in-memory SQLite, zero Epic latency) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

Environment variables: `PORT` (default `3000`), `DB_PATH` (default `data/meridian.db`),
`LOG_LEVEL` (`debug`, `info`, `warn`, `error`, `silent`; default `info`).

### Dev container

With Docker running and the VS Code **Dev Containers** extension installed, open this repository
and run **Dev Containers: Reopen in Container**. The container uses Node.js 22 (matching CI) on Debian
Bookworm, includes the native build tools needed by `better-sqlite3`, and runs as the non-root `node`
user. Initial setup runs `npm ci` from the lockfile and configures TypeScript and ESLint support.

In the container terminal, run `npm run dev`. Port 3000 is forwarded to the host; check
`http://localhost:3000/health` once the API is running. Run `npm test`, `npm run typecheck`, and
`npm run lint` in the same terminal to validate changes.

Dependencies live in a container-specific Docker volume, separate from host `node_modules`, so native
SQLite binaries built on macOS or Windows are not reused on Linux. Run `npm ci` inside the container
after changing `package-lock.json`. The workspace, including `data/meridian.db`, remains on the host
and survives container rebuilds. Container setup does not start the API or wipe/reseed an existing
database.

## Sentry

Set `SENTRY_DSN` to enable server-side error reporting. For local development, copy `.env.example` to
`.env` and set the DSN there; `.env` is ignored by Git. Deployments should set environment variables
directly. The app captures unhandled route errors with status 500 or higher in the `demo` environment.
Request bodies, query strings, headers and user details are removed before events are sent, and patient
names, email addresses, phone numbers and birth dates are scrubbed. Without `SENTRY_DSN`, Sentry remains
disabled. Run `npm run sentry:test` to send a synthetic test error.

## Time model

- Each clinic has an IANA timezone: `America/Chicago`, `America/Los_Angeles`, `America/New_York`.
- Provider working hours (`workStart`, `workEnd`, `workDays` as ISO weekdays, 1 = Monday) are in the
  clinic's local time.
- The `date` query parameter for slots is a clinic-local date.
- Appointments are stored and returned in UTC. Slot responses also include `localStart`/`localEnd` with the
  clinic's offset. Slots are computed in local time first, so working hours stay fixed across DST changes.

## Endpoints

### `GET /clinics`
Lists clinics with their timezone and providers.

### `GET /providers/:id/slots?date=YYYY-MM-DD`
Free slots for that provider on a clinic-local date. Booked slots and slots that already started are removed.
Non-working days return an empty list.

```bash
curl "localhost:3000/providers/1/slots?date=2026-11-02"
```

### `POST /appointments`
```bash
curl -X POST localhost:3000/appointments -H 'content-type: application/json' \
  -d '{"providerId":1,"patientId":3,"start":"2026-11-02T09:00:00-06:00","reason":"Follow-up"}'
```
`start` is any ISO 8601 timestamp with an offset. `durationMinutes` defaults to the provider's slot length.

| Status | Code | When |
|---|---|---|
| 201 | | Booked |
| 400 | `VALIDATION_ERROR`, `START_IN_PAST` | Bad body or past start time |
| 404 | `PROVIDER_NOT_FOUND`, `PATIENT_NOT_FOUND` | Unknown IDs |
| 409 | `APPOINTMENT_OVERLAP` | Intersects a booked appointment for the same provider |
| 422 | `OUTSIDE_WORKING_HOURS` | Not fully inside the provider's working hours |

Two appointments overlap when `existing.start < new.end AND existing.end > new.start`, so back-to-back
appointments are allowed. The check and insert run in one SQLite `IMMEDIATE` transaction.

### `DELETE /appointments/:id`
Soft-cancels the appointment (`status: "cancelled"`), which frees its slot. Returns 404 for unknown IDs and
409 if the appointment is already cancelled.

### `GET /visits/:id/context`
A visit is an appointment. This endpoint gathers a patient profile, contact details, the clinic care team,
location, allergies and medications. The response retains the visit's primary practitioner alongside the
care team. Each Epic call is attributed to the visit.

### `GET /metrics/epic`
```json
{
  "totalCalls": 8,
  "byResource": { "Patient": 3, "Practitioner": 2, "Location": 1, "AllergyIntolerance": 1, "MedicationRequest": 1 },
  "byTag": { "fhir": 6, "private": 2 },
  "byVisit": { "1": 8 },
  "averageCallsPerVisit": 8,
  "resourceTags": { "Patient": "fhir", "...": "..." },
  "pricePerPrivateCallUsd": 0.04,
  "meteredCostUsd": 0.08
}
```

### `GET /health`
Liveness check.

## Mock Epic client

`src/epic/` contains an in-process stand-in for an Epic FHIR R4 API:

- Every call waits 150 ms (configurable through `latencyMs`) and returns FHIR-shaped JSON from fixtures.
- Every call is counted by resource type, including calls that fail.
- Each resource is tagged in `RESOURCE_TAGS` (`src/epic/types.ts`). `fhir` calls are free. `private` calls
  are metered at a fictional $0.04 each. By default AllergyIntolerance and MedicationRequest are `private`.
- Allergy resources are available through `searchAllergyIntolerance` (`fhir`) and
  `getPrivateAllergies` (`private`). Visit context uses `getPrivateAllergies`.
- Metrics live in memory and reset when the process restarts.

## Logging

`src/logger.ts` writes one JSON object per line to stdout with `ts`, `level`, `msg` and context fields.
Every request is logged with a request ID (also returned in the `x-request-id` header). Logs carry IDs only,
never patient names, emails or phone numbers.

## Project layout

```
src/
  app.ts, index.ts      Express app factory and server entry
  logger.ts, errors.ts  JSON logger, HTTP errors and error middleware
  db/                   schema, seed data, repository queries
  domain/               slot generation, booking/cancel, visit context
  epic/                 mock Epic FHIR client, fixtures, metrics
  routes/               one router per resource
tests/                  Vitest suites
```
