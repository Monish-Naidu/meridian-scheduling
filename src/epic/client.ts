import type { Logger } from "../logger";
import { allergiesFor, FHIR_LOCATIONS, FHIR_PATIENTS, FHIR_PRACTITIONERS, medicationsFor } from "./fixtures";
import { EpicMetrics } from "./metrics";
import {
  type EpicCallContext,
  type EpicResource,
  type FhirBundle,
  type FhirResource,
  RESOURCE_TAGS,
} from "./types";

export class EpicNotFoundError extends Error {
  constructor(
    public readonly resource: EpicResource,
    public readonly resourceId: string,
  ) {
    super(`Epic ${resource}/${resourceId} not found`);
    this.name = "EpicNotFoundError";
  }
}

export interface EpicClientOptions {
  latencyMs?: number;
  metrics?: EpicMetrics;
  logger: Logger;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const bundle = <T extends FhirResource>(resources: T[]): FhirBundle<T> => ({
  resourceType: "Bundle",
  type: "searchset",
  total: resources.length,
  entry: resources.map((resource) => ({ resource })),
});

/** In-process stand-in for an Epic FHIR R4 endpoint. Every call is counted, including failures. */
export class EpicClient {
  readonly metrics: EpicMetrics;
  private readonly latencyMs: number;
  private readonly log: Logger;

  constructor(options: EpicClientOptions) {
    this.latencyMs = options.latencyMs ?? 150;
    this.metrics = options.metrics ?? new EpicMetrics();
    this.log = options.logger.child({ component: "epic" });
  }

  getPatient(id: string, ctx: EpicCallContext = {}): Promise<FhirResource> {
    return this.call("Patient", ctx, () => this.read("Patient", FHIR_PATIENTS, id));
  }

  getPractitioner(id: string, ctx: EpicCallContext = {}): Promise<FhirResource> {
    return this.call("Practitioner", ctx, () => this.read("Practitioner", FHIR_PRACTITIONERS, id));
  }

  getLocation(id: string, ctx: EpicCallContext = {}): Promise<FhirResource> {
    return this.call("Location", ctx, () => this.read("Location", FHIR_LOCATIONS, id));
  }

  searchAllergyIntolerance(patientId: string, ctx: EpicCallContext = {}): Promise<FhirBundle> {
    return this.call("AllergyIntolerance", ctx, () => bundle(allergiesFor(patientId)));
  }

  searchMedicationRequest(patientId: string, ctx: EpicCallContext = {}): Promise<FhirBundle> {
    return this.call("MedicationRequest", ctx, () => bundle(medicationsFor(patientId)));
  }

  private read(resource: EpicResource, table: Record<string, FhirResource>, id: string): FhirResource {
    const found = table[id];
    if (!found) throw new EpicNotFoundError(resource, id);
    return found;
  }

  private async call<T>(resource: EpicResource, ctx: EpicCallContext, handler: () => T): Promise<T> {
    const tag = RESOURCE_TAGS[resource];
    const started = Date.now();
    this.metrics.record({ resource, tag, visitId: ctx.visitId, at: new Date(started).toISOString() });
    await sleep(this.latencyMs);
    try {
      const result = handler();
      this.log.debug("epic call", { resource, tag, visitId: ctx.visitId, durationMs: Date.now() - started });
      return result;
    } catch (err) {
      this.log.warn("epic call failed", { resource, tag, visitId: ctx.visitId, err });
      throw err;
    }
  }
}
