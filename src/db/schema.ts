export const SCHEMA = `
CREATE TABLE IF NOT EXISTS clinics (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  timezone TEXT NOT NULL,
  epic_location_id TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS providers (
  id INTEGER PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id),
  name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  epic_practitioner_id TEXT NOT NULL UNIQUE,
  work_start TEXT NOT NULL,
  work_end TEXT NOT NULL,
  work_days TEXT NOT NULL,
  slot_minutes INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  epic_patient_id TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL REFERENCES providers(id),
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  start_utc TEXT NOT NULL,
  end_utc TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('booked', 'cancelled')),
  reason TEXT,
  created_at TEXT NOT NULL,
  cancelled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_appointments_provider_time
  ON appointments (provider_id, status, start_utc, end_utc);
`;
