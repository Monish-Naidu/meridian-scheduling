import {
  EPIC_RESOURCES,
  type EpicCallRecord,
  type EpicCallTag,
  type EpicResource,
  PRIVATE_CALL_PRICE_CENTS,
  RESOURCE_TAGS,
} from "./types";

export interface EpicMetricsSnapshot {
  totalCalls: number;
  byResource: Record<EpicResource, number>;
  byTag: Record<EpicCallTag, number>;
  byVisit: Record<string, number>;
  averageCallsPerVisit: number;
  resourceTags: Record<EpicResource, EpicCallTag>;
  pricePerPrivateCallUsd: number;
  meteredCostUsd: number;
}

export class EpicMetrics {
  private calls: EpicCallRecord[] = [];

  record(call: EpicCallRecord): void {
    this.calls.push(call);
  }

  reset(): void {
    this.calls = [];
  }

  snapshot(): EpicMetricsSnapshot {
    const byResource = Object.fromEntries(EPIC_RESOURCES.map((r) => [r, 0])) as Record<EpicResource, number>;
    const byTag: Record<EpicCallTag, number> = { fhir: 0, private: 0 };
    const byVisit: Record<string, number> = {};

    for (const call of this.calls) {
      byResource[call.resource] += 1;
      byTag[call.tag] += 1;
      if (call.visitId !== undefined) {
        const key = String(call.visitId);
        byVisit[key] = (byVisit[key] ?? 0) + 1;
      }
    }

    const visitCount = Object.keys(byVisit).length;
    const visitCalls = Object.values(byVisit).reduce((a, b) => a + b, 0);

    return {
      totalCalls: this.calls.length,
      byResource,
      byTag,
      byVisit,
      averageCallsPerVisit: visitCount === 0 ? 0 : Math.round((visitCalls / visitCount) * 100) / 100,
      resourceTags: { ...RESOURCE_TAGS },
      pricePerPrivateCallUsd: PRIVATE_CALL_PRICE_CENTS / 100,
      // Integer cents avoid float drift (0.04 * 3 !== 0.12).
      meteredCostUsd: (byTag.private * PRIVATE_CALL_PRICE_CENTS) / 100,
    };
  }
}
