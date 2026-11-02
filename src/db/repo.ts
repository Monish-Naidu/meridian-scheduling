import type { Db } from "./index";

export interface Clinic {
  id: number;
  name: string;
  city: string;
  timezone: string;
  epicLocationId: string;
}

export interface Provider {
  id: number;
  clinicId: number;
  name: string;
  specialty: string;
  epicPractitionerId: string;
  workStart: string;
  workEnd: string;
  workDays: number[];
  slotMinutes: number;
}

export interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  epicPatientId: string;
}

export type AppointmentStatus = "booked" | "cancelled";

export interface Appointment {
  id: number;
  providerId: number;
  patientId: number;
  startUtc: string;
  endUtc: string;
  status: AppointmentStatus;
  reason: string | null;
  createdAt: string;
  cancelledAt: string | null;
}

interface ProviderRow {
  id: number;
  clinic_id: number;
  name: string;
  specialty: string;
  epic_practitioner_id: string;
  work_start: string;
  work_end: string;
  work_days: string;
  slot_minutes: number;
}

interface AppointmentRow {
  id: number;
  provider_id: number;
  patient_id: number;
  start_utc: string;
  end_utc: string;
  status: AppointmentStatus;
  reason: string | null;
  created_at: string;
  cancelled_at: string | null;
}

const toProvider = (r: ProviderRow): Provider => ({
  id: r.id,
  clinicId: r.clinic_id,
  name: r.name,
  specialty: r.specialty,
  epicPractitionerId: r.epic_practitioner_id,
  workStart: r.work_start,
  workEnd: r.work_end,
  workDays: r.work_days.split(",").map(Number),
  slotMinutes: r.slot_minutes,
});

export const toAppointment = (r: AppointmentRow): Appointment => ({
  id: r.id,
  providerId: r.provider_id,
  patientId: r.patient_id,
  startUtc: r.start_utc,
  endUtc: r.end_utc,
  status: r.status,
  reason: r.reason,
  createdAt: r.created_at,
  cancelledAt: r.cancelled_at,
});

export function listClinics(db: Db): Clinic[] {
  return db
    .prepare(
      "SELECT id, name, city, timezone, epic_location_id AS epicLocationId FROM clinics ORDER BY id",
    )
    .all() as Clinic[];
}

export function getClinic(db: Db, id: number): Clinic | undefined {
  return db
    .prepare("SELECT id, name, city, timezone, epic_location_id AS epicLocationId FROM clinics WHERE id = ?")
    .get(id) as Clinic | undefined;
}

export function listProvidersByClinic(db: Db, clinicId: number): Provider[] {
  const rows = db.prepare("SELECT * FROM providers WHERE clinic_id = ? ORDER BY id").all(clinicId) as ProviderRow[];
  return rows.map(toProvider);
}

export function getProvider(db: Db, id: number): Provider | undefined {
  const row = db.prepare("SELECT * FROM providers WHERE id = ?").get(id) as ProviderRow | undefined;
  return row && toProvider(row);
}

export function getPatient(db: Db, id: number): Patient | undefined {
  return db
    .prepare(
      `SELECT id, first_name AS firstName, last_name AS lastName, email, phone,
              date_of_birth AS dateOfBirth, epic_patient_id AS epicPatientId
       FROM patients WHERE id = ?`,
    )
    .get(id) as Patient | undefined;
}

export function getAppointment(db: Db, id: number): Appointment | undefined {
  const row = db.prepare("SELECT * FROM appointments WHERE id = ?").get(id) as AppointmentRow | undefined;
  return row && toAppointment(row);
}

/** Booked appointments for a provider that intersect [fromUtc, toUtc). */
export function findBookedInRange(db: Db, providerId: number, fromUtc: string, toUtc: string): Appointment[] {
  const rows = db
    .prepare(
      `SELECT * FROM appointments
       WHERE provider_id = ? AND status = 'booked' AND start_utc < ? AND end_utc > ?
       ORDER BY start_utc`,
    )
    .all(providerId, toUtc, fromUtc) as AppointmentRow[];
  return rows.map(toAppointment);
}
