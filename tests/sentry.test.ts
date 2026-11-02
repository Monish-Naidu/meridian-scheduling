import type { ErrorEvent } from "@sentry/node";
import { describe, expect, it } from "vitest";
import { sanitizeSentryEvent } from "../src/sentry/sanitize-event";

describe("Sentry event sanitization", () => {
  it("removes patient personal data and preserves patient IDs", () => {
    const event = {
      event_id: "test-event",
      type: undefined,
      message: "Failure for SENTINEL-PATIENT-NAME, sentinel@example.invalid, phone 555-0101, born 1980-01-02",
      request: {
        method: "POST",
        url: "/visits/42/context?email=sentinel%40example.invalid",
        data: {
          patientId: "patient-42",
          patientName: "SENTINEL-PATIENT-NAME",
          email: "sentinel@example.invalid",
          phone: "555-0101",
          dateOfBirth: "1980-01-02",
        },
        headers: { authorization: "sentinel-token" },
      },
      extra: {
        patient: {
          id: "patient-42",
          name: "SENTINEL-PATIENT-NAME",
          email: "sentinel@example.invalid",
          phone: "555-0101",
          date_of_birth: "1980-01-02",
        },
      },
      user: { id: "patient-42", name: "SENTINEL-PATIENT-NAME", email: "sentinel@example.invalid" },
      contexts: {
        runtime: { name: "node", type: "runtime" },
        sdk: { name: "sentry.javascript.node" },
      },
    } as ErrorEvent;

    const sanitized = sanitizeSentryEvent(event);
    const serialized = JSON.stringify(sanitized);

    expect(sanitized.request).toEqual({ method: "POST", url: "/visits/42/context" });
    expect(sanitized.user).toBeUndefined();
    expect(serialized).toContain("patient-42");
    expect(serialized).toContain('"name":"node"');
    expect(serialized).toContain("sentry.javascript.node");
    for (const personalValue of ["SENTINEL-PATIENT-NAME", "sentinel@example.invalid", "555-0101", "1980-01-02"]) {
      expect(serialized).not.toContain(personalValue);
    }
  });
});
