import type { Db } from "../db/index";
import { getAppointment, getClinic, getPatient, getProvider, listProvidersByClinic } from "../db/repo";
import { EpicNotFoundError, type EpicClient } from "../epic/client";
import type { EpicCallContext, FhirResource } from "../epic/types";
import { HttpError } from "../errors";

async function loadPatientProfile(epic: EpicClient, patientId: string, ctx: EpicCallContext) {
  return epic.getPatient(patientId, ctx);
}

async function loadContactDetails(epic: EpicClient, patientId: string, ctx: EpicCallContext) {
  const patient = await epic.getPatient(patientId, ctx);
  return { patientReference: `Patient/${patient.id}`, telecom: patient.telecom };
}

async function loadClinicalSummary(epic: EpicClient, patientId: string, ctx: EpicCallContext) {
  const patient = await epic.getPatient(patientId, ctx);
  const [allergies, medications] = await Promise.all([
    epic.getPrivateAllergies(patient.id, ctx),
    epic.searchMedicationRequest(patient.id, ctx),
  ]);
  return {
    allergies: allergies.entry.map((e) => e.resource),
    medications: medications.entry.map((e) => e.resource),
  };
}

async function loadCareTeam(db: Db, epic: EpicClient, clinicId: number, ctx: EpicCallContext) {
  const careTeam: FhirResource[] = [];
  for (const provider of listProvidersByClinic(db, clinicId)) {
    careTeam.push(await epic.getPractitioner(provider.epicPractitionerId, ctx));
  }
  return careTeam;
}

/** Gathers the Epic data a provider needs before a visit. */
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
    const [fhirPatient, contactDetails, clinicalSummary, careTeam, location] = await Promise.all([
      loadPatientProfile(epic, patient.epicPatientId, ctx),
      loadContactDetails(epic, patient.epicPatientId, ctx),
      loadClinicalSummary(epic, patient.epicPatientId, ctx),
      loadCareTeam(db, epic, clinic.id, ctx),
      epic.getLocation(clinic.epicLocationId, ctx),
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
      contactDetails,
      practitioner: careTeam.find((member) => member.id === provider.epicPractitionerId),
      careTeam,
      location,
      ...clinicalSummary,
      epic: { calls: 6 + careTeam.length, durationMs: Date.now() - started },
    };
  } catch (err) {
    if (err instanceof EpicNotFoundError) {
      throw new HttpError(502, "EPIC_RESOURCE_NOT_FOUND", err.message);
    }
    throw err;
  }
}
