import { DateTime } from "luxon";
import type { Db } from "../db/index";
import {
  type Appointment,
  findBookedInRange,
  getAppointment,
  getClinic,
  getPatient,
  getProvider,
} from "../db/repo";
import { HttpError } from "../errors";
import { parseLocalDate, generateSlots, type Slot, toUtcIso, workingWindow } from "./slots";

export interface BookingInput {
  providerId: number;
  patientId: number;
  start: string;
  durationMinutes?: number;
  reason?: string;
}

export interface ProviderSlots {
  providerId: number;
  clinicId: number;
  timezone: string;
  date: string;
  slotMinutes: number;
  slots: Slot[];
}

function loadProviderWithClinic(db: Db, providerId: number) {
  const provider = getProvider(db, providerId);
  if (!provider) throw new HttpError(404, "PROVIDER_NOT_FOUND", `Provider ${providerId} not found`);
  const clinic = getClinic(db, provider.clinicId);
  if (!clinic) throw new HttpError(500, "CLINIC_MISSING", `Clinic ${provider.clinicId} not found`);
  return { provider, clinic };
}

export function getProviderSlots(db: Db, providerId: number, date: string, now: Date): ProviderSlots {
  const { provider, clinic } = loadProviderWithClinic(db, providerId);
  const day = parseLocalDate(date, clinic.timezone);
  if (!day) throw new HttpError(400, "INVALID_DATE", "date must be a valid YYYY-MM-DD");

  const booked = findBookedInRange(
    db,
    provider.id,
    toUtcIso(day),
    toUtcIso(day.plus({ days: 1 })),
  );
  return {
    providerId: provider.id,
    clinicId: clinic.id,
    timezone: clinic.timezone,
    date,
    slotMinutes: provider.slotMinutes,
    slots: generateSlots(provider, clinic.timezone, date, booked, now),
  };
}

export function bookAppointment(db: Db, input: BookingInput, now: Date): Appointment {
  const { provider, clinic } = loadProviderWithClinic(db, input.providerId);
  if (!getPatient(db, input.patientId)) {
    throw new HttpError(404, "PATIENT_NOT_FOUND", `Patient ${input.patientId} not found`);
  }

  const start = DateTime.fromISO(input.start, { setZone: true });
  if (!start.isValid) throw new HttpError(400, "INVALID_START", "start must be an ISO 8601 timestamp");
  const duration = input.durationMinutes ?? provider.slotMinutes;
  const end = start.plus({ minutes: duration });

  if (start.toMillis() < now.getTime()) {
    throw new HttpError(400, "START_IN_PAST", "Appointments must start in the future");
  }

  const localDate = start.setZone(clinic.timezone).toISODate() as string;
  const window = workingWindow(provider, clinic.timezone, localDate);
  if (!window || start < window.start || end > window.end) {
    throw new HttpError(422, "OUTSIDE_WORKING_HOURS", "Appointment is outside the provider's working hours", {
      timezone: clinic.timezone,
      workStart: provider.workStart,
      workEnd: provider.workEnd,
      workDays: provider.workDays,
    });
  }

  const startUtc = toUtcIso(start);
  const endUtc = toUtcIso(end);

  // The overlap check and insert share one IMMEDIATE transaction so two writers cannot
  // both pass the check before either inserts.
  const insert = db.transaction((): Appointment => {
    const conflicts = findBookedInRange(db, provider.id, startUtc, endUtc);
    if (conflicts.length > 0) {
      throw new HttpError(409, "APPOINTMENT_OVERLAP", "Provider already has an appointment in this time range", {
        conflictingAppointmentIds: conflicts.map((c) => c.id),
      });
    }
    const result = db
      .prepare(
        `INSERT INTO appointments (provider_id, patient_id, start_utc, end_utc, status, reason, created_at)
         VALUES (?, ?, ?, ?, 'booked', ?, ?)`,
      )
      .run(provider.id, input.patientId, startUtc, endUtc, input.reason ?? null, now.toISOString());
    return getAppointment(db, Number(result.lastInsertRowid)) as Appointment;
  });
  return insert.immediate();
}

export function cancelAppointment(db: Db, id: number, now: Date): Appointment {
  const cancel = db.transaction((): Appointment => {
    const existing = getAppointment(db, id);
    if (!existing) throw new HttpError(404, "APPOINTMENT_NOT_FOUND", `Appointment ${id} not found`);
    if (existing.status === "cancelled") {
      throw new HttpError(409, "ALREADY_CANCELLED", `Appointment ${id} is already cancelled`);
    }
    db.prepare("UPDATE appointments SET status = 'cancelled', cancelled_at = ? WHERE id = ?").run(
      now.toISOString(),
      id,
    );
    return getAppointment(db, id) as Appointment;
  });
  return cancel.immediate();
}
