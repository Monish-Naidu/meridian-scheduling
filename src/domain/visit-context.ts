import type { Db } from "../db/index";
import { getAppointment, getClinic, getPatient, getProvider } from "../db/repo";
import { EpicNotFoundError, type EpicClient } from "../epic/client";
import { HttpError } from "../errors";

/** Gathers the Epic data a provider needs before a visit. Calls run in parallel. */
export async function getVisitContext(db: Db, epic: EpicClient, visitId: number) {
  const appointment = getAppointment(db, visitId);
  if (!appointment) throw new HttpError(404, "VISIT_NOT_FOUND", `Visit ${visitId} not found`);
  const provider = getProvider(db, appointment.providerId);
  const patient = getPatient(db, appointment.patientId);
  const clinic = provider && getClinic(db, provider.clinicId);
  if (!provider || !patient || !clinic) {
    throw new HttpError(500, "VISIT_INCOMPLETE", `Visit ${visitId} references missing records`);
  }

  const ctx = { visitId };
  const started = Date.now();
  try {
    const [fhirPatient, practitioner, location, allergies, medications] = await Promise.all([
      epic.getPatient(patient.epicPatientId, ctx),
      epic.getPractitioner(provider.epicPractitionerId, ctx),
      epic.getLocation(clinic.epicLocationId, ctx),
      epic.searchAllergyIntolerance(patient.epicPatientId, ctx),
      epic.searchMedicationRequest(patient.epicPatientId, ctx),
    ]);
    return {
      visit: {
        id: appointment.id,
        status: appointment.status,
        start: appointment.startUtc,
        end: appointment.endUtc,
        reason: appointment.reason,
        timezone: clinic.timezone,
      },
      patient: fhirPatient,
      practitioner,
      location,
      allergies: allergies.entry.map((e) => e.resource),
      medications: medications.entry.map((e) => e.resource),
      epic: { calls: 5, durationMs: Date.now() - started },
    };
  } catch (err) {
    if (err instanceof EpicNotFoundError) {
      throw new HttpError(502, "EPIC_RESOURCE_NOT_FOUND", err.message);
    }
    throw err;
  }
}
