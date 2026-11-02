export const EPIC_RESOURCES = [
  "Patient",
  "Practitioner",
  "Location",
  "AllergyIntolerance",
  "MedicationRequest",
] as const;

export type EpicResource = (typeof EPIC_RESOURCES)[number];

/** "fhir" calls go through the standard FHIR API and are free; "private" calls are metered. */
export type EpicCallTag = "fhir" | "private";

/** Fictional pricing for the demo. Adjust here to change how calls are classified. */
export const RESOURCE_TAGS: Record<EpicResource, EpicCallTag> = {
  Patient: "fhir",
  Practitioner: "fhir",
  Location: "fhir",
  AllergyIntolerance: "private",
  MedicationRequest: "private",
};

export const PRIVATE_CALL_PRICE_CENTS = 4;

export interface EpicCallContext {
  visitId?: number;
}

export interface EpicCallRecord {
  resource: EpicResource;
  tag: EpicCallTag;
  visitId?: number;
  at: string;
}

export interface FhirResource {
  resourceType: string;
  id: string;
  [key: string]: unknown;
}

export interface FhirBundle<T extends FhirResource = FhirResource> {
  resourceType: "Bundle";
  type: "searchset";
  total: number;
  entry: { resource: T }[];
}
