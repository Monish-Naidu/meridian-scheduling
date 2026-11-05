---
name: qa-api
description: >
  QA tests for the meridian-scheduling Express API. Starts the branch's API on a throwaway
  SQLite database and exercises clinics, slots (timezones and DST), booking with overlap and
  working-hours rules, cancel and rebook, visit context, and Epic call metrics with curl.
---

# QA: Meridian Scheduling API

The API is a TypeScript Express 5 app on SQLite with no authentication. All data is fictional seed data: 3 clinics, 6 providers, 10 patients. Persona: `api_client` (no credentials needed).

## Testing Target

Always test the branch's own code on a local server. Never test a remote environment and never fall back to `data/meridian.db`.

1. If `node_modules` is missing, run `npm ci`.
2. Create a throwaway directory and pick the port from config (`3100`):
   `export QA_DIR="$(mktemp -d)" BASE=http://localhost:3100`
3. Start the server as a background job (use the shell tool's background mode, not `&` inside a short-lived command):
   `DB_PATH="$QA_DIR/qa.db" PORT=3100 LOG_LEVEL=warn npm start`
   Do not set `SENTRY_DSN`. The database is created and seeded on first start.
4. Poll `curl -sf $BASE/health` once per second for up to 30 seconds until it returns `{"status":"ok"}`. If it never does, report all flows BLOCKED and include the last lines of the server output.
5. Epic metrics live in memory, so a fresh server starts at `totalCalls: 0`.

### Cleanup (always run, even after failures)

Stop the server process you started, then `rm -rf "$QA_DIR"`.

### Dates

The server uses the real clock, and slot dates are clinic-local. Compute dates at run time instead of hardcoding them:

- Next Monday at least 2 days ahead in Chicago (provider 1 works that day):
  `node -e 'const {DateTime}=require("luxon");let d=DateTime.now().setZone("America/Chicago").plus({days:2}).startOf("day");while(d.weekday!==1)d=d.plus({days:1});console.log(d.toISODate())'`
- First Monday after the next DST change in Chicago:
  `node -e 'const {DateTime}=require("luxon");let d=DateTime.now().setZone("America/Chicago").plus({days:2}).startOf("day");const o=d.offset;do{d=d.plus({days:1})}while(d.offset===o);while(d.weekday!==1)d=d.plus({days:1});console.log(d.toISODate(),d.offset/60)'`

When booking, use a `start` value taken from a slot response rather than computing UTC times by hand.

## Seed reference

| Provider | Clinic (timezone) | Hours (local) | Days | Slot |
| --- | --- | --- | --- | --- |
| 1 | 1 Chicago (`America/Chicago`) | 08:00-16:00 | Mon-Fri | 30 min |
| 2 | 1 Chicago | 10:00-18:00 | Mon-Thu | 30 min |
| 3 | 2 Los Angeles (`America/Los_Angeles`) | 09:00-17:00 | Mon-Fri | 30 min |
| 4 | 2 Los Angeles | 07:00-13:00 | Tue-Sat | 20 min |
| 5 | 3 New York (`America/New_York`) | 09:00-15:00 | Mon-Fri | 45 min |
| 6 | 3 New York | 12:00-20:00 | Mon-Fri | 60 min |

Patients have IDs 1-10. Each clinic has 2 providers.

## Flow menu

Pick only the flows relevant to the diff (see the orchestrator). Each flow lists the code it covers.

### F1. Health and clinics (`src/app.ts`, `src/routes/clinics.ts`, `src/db/**`)

- `GET /health` returns 200 `{"status":"ok"}` and an `x-request-id` header.
- `GET /clinics` returns 3 clinics with timezones `America/Chicago`, `America/Los_Angeles`, `America/New_York`, each with 2 providers.
- Negative: `GET /does-not-exist` returns 404 with a JSON error body.

### F2. Provider slots (`src/routes/providers.ts`, `src/domain/slots.ts`, `src/domain/appointments.ts`)

- `GET /providers/1/slots?date=<next Monday>` returns 200 with `timezone: "America/Chicago"`, `slotMinutes: 30`, and 16 slots. The first slot's `localStart` is 08:00 local and `start` ends in `Z`.
- Check one provider in each other timezone (for example provider 3 and provider 5) and confirm `localStart` matches their working hours.
- Non-working day (for example provider 2 on a Friday, or provider 1 on Saturday) returns an empty `slots` list.
- Negative: `date=01/07/2030` and a missing `date` return 400; provider 999 returns 404.

### F3. DST handling (`src/domain/slots.ts`)

- For the first Monday after the next DST change, provider 1 still has 16 slots starting at 08:00 local. The UTC `start` of the first slot shifts by one hour compared with a Monday before the change, and the `localStart` offset matches the new offset.

### F4. Booking (`src/routes/appointments.ts`, `src/domain/appointments.ts`, `src/validate.ts`)

- `POST /appointments` with `{"providerId":1,"patientId":1,"start":<a slot start>,"reason":"QA booking"}` returns 201, `status: "booked"`, UTC `startUtc`/`endUtc` 30 minutes apart.
- The booked slot no longer appears in `GET /providers/1/slots` for that date.
- A start time with a local offset (for example `...T09:00:00-06:00` or `-05:00` depending on DST) is accepted and normalized to UTC.
- Negative cases (one row each, check status and `error.code`):
  - Before working hours or running past the end: 422 `OUTSIDE_WORKING_HOURS`
  - A start in the past: 400 `START_IN_PAST`
  - `start: "tomorrow"` or a missing field: 400 `VALIDATION_ERROR`
  - Unknown patient 999: 404 `PATIENT_NOT_FOUND`; unknown provider 999: 404 `PROVIDER_NOT_FOUND`

### F5. Overlap rules (`src/domain/appointments.ts`)

After booking provider 1 at slot S:

- Same provider, same start: 409 `APPOINTMENT_OVERLAP`.
- Same provider, start 15 minutes into S: 409.
- Same provider, back-to-back (start = S end, or end = S start): 201.
- Different provider at the same time (provider 2, if within its hours): 201.

### F6. Cancel and rebook (`src/routes/appointments.ts`, `src/domain/appointments.ts`)

- `DELETE /appointments/:id` returns 200 with `status: "cancelled"` and a `cancelledAt` value.
- The slot reappears in the slot list, and a new booking at the same time returns 201.
- Negative: cancelling again returns 409; `DELETE /appointments/12345` returns 404.

### F7. Visit context and Epic metrics (`src/routes/visits.ts`, `src/domain/visit-context.ts`, `src/epic/**`, `src/routes/metrics.ts`)

- Book provider 1 with patient 3, then `GET /visits/<id>/context` returns 200 with `patient.id: "ePAT-5003"`, `practitioner.id: "ePRAC-1001"`, `location.id: "eLOC-CHI-001"`, a `careTeam` of `["ePRAC-1001","ePRAC-1002"]`, 2 allergies, 1 medication, and `epic.calls: 8`.
- `GET /metrics/epic` on a fresh server after one context call shows `totalCalls: 8`, `byTag: {"fhir":6,"private":2}`, `byVisit: {"<id>":8}`, and `meteredCostUsd: 0.08`. A second context call doubles the counts for that visit.
- Negative: `GET /visits/999/context` returns 404 and does not increase `totalCalls`.
- Evidence must follow the PHI rule: show IDs, counts, and costs only. Never copy `name`, `telecom`, `birthDate`, or `contactDetails.telecom` into the report.

### F8. Request logging and PHI (`src/logger.ts`, `src/app.ts`, `src/errors.ts`, `src/sentry/**`)

- Send a request with `x-request-id: qa-<RUN_ID>` and confirm the same value comes back in the response header.
- Restart the server with `LOG_LEVEL=info` for this flow, book and fetch a visit context, then scan the server output for any seed patient email (`@example.com`), phone (`555-01`), or birth date. Any match is a FAIL. Report only whether a match was found and which field type, never the value itself.

## Known Failure Modes

1. **Port 3100 already in use.** A previous server may still be running. Stop it, or pick another free port and use it for both `PORT` and `BASE`.
2. **`START_IN_PAST` on a valid-looking date.** The server uses the real clock. Use the date helpers above and pick dates at least 2 days ahead.
3. **Wrong slot count across DST.** Compare `localStart`, not UTC hours; working hours are fixed in local time.
4. **Command blocked by `.factory/hooks/block-prod-db.mjs`.** The hook blocks commands that mention production databases or run `npm run seed` against prod. Use only the temporary `DB_PATH` under `$QA_DIR`; never work around the hook.
5. **Visit context is slow.** Each Epic call waits about 150 ms, so one context call takes roughly a second. Use a curl timeout of at least 10 seconds.
6. **Epic metrics not zero.** Metrics are per process. If counts are higher than expected, compare deltas or restart the server.
