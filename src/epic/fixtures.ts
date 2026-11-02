import { CLINICS, PATIENTS, PROVIDERS } from "../db/seed-data";
import type { FhirResource } from "./types";

// Fake clinical data keyed by Epic ID. Built from the same seed data so IDs line up with SQLite.

export const FHIR_PATIENTS: Record<string, FhirResource> = Object.fromEntries(
  PATIENTS.map((p) => [
    p.epicPatientId,
    {
      resourceType: "Patient",
      id: p.epicPatientId,
      name: [{ use: "official", family: p.lastName, given: [p.firstName] }],
      birthDate: p.dateOfBirth,
      telecom: [
        { system: "phone", value: p.phone, use: "mobile" },
        { system: "email", value: p.email },
      ],
    },
  ]),
);

export const FHIR_PRACTITIONERS: Record<string, FhirResource> = Object.fromEntries(
  PROVIDERS.map((p) => [
    p.epicPractitionerId,
    {
      resourceType: "Practitioner",
      id: p.epicPractitionerId,
      name: [{ text: p.name }],
      qualification: [{ code: { text: p.specialty } }],
    },
  ]),
);

export const FHIR_LOCATIONS: Record<string, FhirResource> = Object.fromEntries(
  CLINICS.map((c) => [
    c.epicLocationId,
    {
      resourceType: "Location",
      id: c.epicLocationId,
      name: c.name,
      address: { city: c.city, country: "US" },
      extension: [{ url: "urn:meridian:timezone", valueString: c.timezone }],
    },
  ]),
);

const ALLERGIES: Record<string, string[]> = {
  "ePAT-5001": ["Penicillin"],
  "ePAT-5003": ["Peanuts", "Latex"],
  "ePAT-5005": ["Sulfonamides"],
  "ePAT-5008": ["Shellfish"],
  "ePAT-5009": ["Ibuprofen"],
};

const MEDICATIONS: Record<string, string[]> = {
  "ePAT-5002": ["Levothyroxine 50 mcg daily"],
  "ePAT-5003": ["Lisinopril 10 mg daily"],
  "ePAT-5005": ["Atorvastatin 20 mg nightly", "Metformin 500 mg twice daily"],
  "ePAT-5007": ["Sertraline 50 mg daily"],
  "ePAT-5008": ["Amlodipine 5 mg daily"],
};

export function allergiesFor(patientId: string): FhirResource[] {
  return (ALLERGIES[patientId] ?? []).map((substance, i) => ({
    resourceType: "AllergyIntolerance",
    id: `${patientId}-allergy-${i + 1}`,
    clinicalStatus: { text: "active" },
    code: { text: substance },
    patient: { reference: `Patient/${patientId}` },
  }));
}

export function medicationsFor(patientId: string): FhirResource[] {
  return (MEDICATIONS[patientId] ?? []).map((med, i) => ({
    resourceType: "MedicationRequest",
    id: `${patientId}-medreq-${i + 1}`,
    status: "active",
    intent: "order",
    medicationCodeableConcept: { text: med },
    subject: { reference: `Patient/${patientId}` },
  }));
}
