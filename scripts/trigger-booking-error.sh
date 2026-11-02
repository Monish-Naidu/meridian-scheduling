#!/usr/bin/env bash
# Books the same provider slot twice so POST /appointments returns a 500 that Sentry reports.
# Starts the API with `npm start` if nothing answers on BASE_URL, and stops it again afterwards.
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${PORT:-3000}"
BASE_URL="${BASE_URL:-http://localhost:$PORT}"
PROVIDER_ID="${PROVIDER_ID:-1}"
PATIENT_ID="${PATIENT_ID:-3}"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if ! curl -sf -m 2 "$BASE_URL/health" >/dev/null; then
  echo "Starting API on port $PORT"
  mkdir -p tmp
  PORT="$PORT" npm start >tmp/trigger-booking-error-server.log 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 30); do
    curl -sf -m 1 "$BASE_URL/health" >/dev/null && break
    sleep 1
  done
  curl -sf -m 2 "$BASE_URL/health" >/dev/null || { echo "API did not start; see tmp/trigger-booking-error-server.log" >&2; exit 1; }
fi

# A random future weekday keeps reruns from landing on an already booked day.
DATE="${DATE:-$(node -e '
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7 + Math.floor(Math.random() * 120));
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  console.log(d.toISOString().slice(0, 10));
')}"

SLOT_START="$(curl -sf "$BASE_URL/providers/$PROVIDER_ID/slots?date=$DATE" | node -e '
  let s = ""; process.stdin.on("data", (c) => (s += c)).on("end", () => {
    const slot = JSON.parse(s).slots[0];
    if (!slot) process.exit(1);
    console.log(slot.localStart);
  });
')" || { echo "No free slot for provider $PROVIDER_ID on $DATE" >&2; exit 1; }

BODY="{\"providerId\":$PROVIDER_ID,\"patientId\":$PATIENT_ID,\"start\":\"$SLOT_START\",\"reason\":\"Follow-up\"}"

book() {
  curl -s -o /dev/stderr -w '%{http_code}' -X POST "$BASE_URL/appointments" \
    -H 'content-type: application/json' -d "$BODY"
}

echo "Booking provider $PROVIDER_ID at $SLOT_START"
FIRST="$(book)"; echo; echo "First booking: HTTP $FIRST"
SECOND="$(book)"; echo; echo "Second booking: HTTP $SECOND"

if [[ "$SECOND" != "500" ]]; then
  echo "Expected HTTP 500 on the second booking, got $SECOND" >&2
  exit 1
fi
echo "Booking error triggered. Check Sentry for \"Appointment schedule is inconsistent\"."

# Give the SDK time to deliver the event before a server this script started is stopped.
[[ -n "$SERVER_PID" ]] && sleep 3
exit 0
