import { describe, expect, it } from "vitest";
import { EpicClient, EpicNotFoundError } from "../src/epic/client";
import { createLogger } from "../src/logger";

describe("EpicClient", () => {
  it("applies the configured latency and counts failed calls", async () => {
    const epic = new EpicClient({ logger: createLogger({ level: "silent" }), latencyMs: 150 });
    const started = Date.now();
    await epic.getLocation("eLOC-NYC-001");
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);

    await expect(epic.getPatient("ePAT-missing")).rejects.toBeInstanceOf(EpicNotFoundError);
    await epic.searchMedicationRequest("ePAT-5005", { visitId: 7 });
    await epic.searchMedicationRequest("ePAT-5005", { visitId: 7 });
    await epic.searchAllergyIntolerance("ePAT-5005", { visitId: 8 });

    const snap = epic.metrics.snapshot();
    expect(snap.totalCalls).toBe(5);
    expect(snap.byTag).toEqual({ fhir: 2, private: 3 });
    expect(snap.byVisit).toEqual({ "7": 2, "8": 1 });
    expect(snap.averageCallsPerVisit).toBe(1.5);
    expect(snap.meteredCostUsd).toBe(0.12);
  });
});
