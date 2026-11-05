import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestApp, MONDAY } from "./helpers";

// Provider 1 works 08:00-16:00 America/Chicago (UTC-6 in January).
const NINE_AM_CHICAGO = "2030-01-07T15:00:00.000Z";

let ctx: ReturnType<typeof makeTestApp>;

beforeEach(() => {
  ctx = makeTestApp();
});

const book = (body: Record<string, unknown>) => request(ctx.app).post("/appointments").send(body);
const slotStarts = async (providerId: number, date = MONDAY) => {
  const res = await request(ctx.app).get(`/providers/${providerId}/slots`).query({ date });
  expect(res.status).toBe(200);
  return (res.body.slots as { start: string }[]).map((s) => s.start);
};

describe("GET /clinics", () => {
  it("lists the three seeded clinics with timezones and two providers each", async () => {
    const res = await request(ctx.app).get("/clinics");
    expect(res.status).toBe(200);
    expect(res.body.clinics.map((c: { timezone: string }) => c.timezone)).toEqual([
      "America/Chicago",
      "America/Los_Angeles",
      "America/New_York",
    ]);
    for (const clinic of res.body.clinics) expect(clinic.providers).toHaveLength(2);
  });
});

describe("GET /providers/:id/slots", () => {
  it("returns slots in UTC with the clinic timezone", async () => {
    const res = await request(ctx.app).get("/providers/1/slots").query({ date: MONDAY });
    expect(res.body).toMatchObject({ providerId: 1, timezone: "America/Chicago", slotMinutes: 30 });
    expect(res.body.slots).toHaveLength(16);
  });

  it("rejects a bad date and an unknown provider", async () => {
    expect((await request(ctx.app).get("/providers/1/slots").query({ date: "01/07/2030" })).status).toBe(400);
    expect((await request(ctx.app).get("/providers/1/slots")).status).toBe(400);
    expect((await request(ctx.app).get("/providers/999/slots").query({ date: MONDAY })).status).toBe(404);
  });
});

describe("POST /appointments", () => {
  it("books an appointment and removes the slot", async () => {
    const res = await book({ providerId: 1, patientId: 1, start: NINE_AM_CHICAGO, reason: "Annual physical" });
    expect(res.status).toBe(201);
    expect(res.body.appointment).toMatchObject({
      providerId: 1,
      patientId: 1,
      startUtc: NINE_AM_CHICAGO,
      endUtc: "2030-01-07T15:30:00.000Z",
      status: "booked",
    });
    expect(await slotStarts(1)).not.toContain(NINE_AM_CHICAGO);
  });

  it("accepts a start time with a local offset", async () => {
    const res = await book({ providerId: 1, patientId: 1, start: "2030-01-07T09:00:00-06:00" });
    expect(res.status).toBe(201);
    expect(res.body.appointment.startUtc).toBe(NINE_AM_CHICAGO);
  });

  it("rejects bookings outside working hours, in the past, or with bad input", async () => {
    expect((await book({ providerId: 1, patientId: 1, start: "2030-01-07T13:00:00.000Z" })).status).toBe(422); // 07:00
    expect((await book({ providerId: 1, patientId: 1, start: "2030-01-07T21:45:00.000Z" })).status).toBe(422); // runs past 16:00
    expect((await book({ providerId: 1, patientId: 1, start: "2030-01-05T15:00:00.000Z" })).status).toBe(422); // Saturday
    expect((await book({ providerId: 1, patientId: 1, start: "2029-12-31T15:00:00.000Z" })).status).toBe(400);
    expect((await book({ providerId: 1, patientId: 1, start: "tomorrow" })).status).toBe(400);
    expect((await book({ providerId: 1, patientId: 999, start: NINE_AM_CHICAGO })).status).toBe(404);
    expect((await book({ providerId: 999, patientId: 1, start: NINE_AM_CHICAGO })).status).toBe(404);
  });
});

describe("overlap rejection", () => {
  beforeEach(async () => {
    expect((await book({ providerId: 1, patientId: 1, start: NINE_AM_CHICAGO })).status).toBe(201);
  });

  it("rejects the exact same time for the same provider", async () => {
    const res = await book({ providerId: 1, patientId: 2, start: NINE_AM_CHICAGO });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("APPOINTMENT_OVERLAP");
  });

  it("rejects partial overlaps on either side", async () => {
    expect((await book({ providerId: 1, patientId: 2, start: "2030-01-07T15:15:00.000Z" })).status).toBe(409);
    expect(
      (await book({ providerId: 1, patientId: 2, start: "2030-01-07T14:45:00.000Z", durationMinutes: 30 })).status,
    ).toBe(409);
    expect(
      (await book({ providerId: 1, patientId: 2, start: "2030-01-07T14:30:00.000Z", durationMinutes: 90 })).status,
    ).toBe(409);
  });

  it("allows back-to-back appointments", async () => {
    expect((await book({ providerId: 1, patientId: 2, start: "2030-01-07T15:30:00.000Z" })).status).toBe(201);
    expect((await book({ providerId: 1, patientId: 3, start: "2030-01-07T14:30:00.000Z" })).status).toBe(201);
  });

  it("does not persist a second booking when rejecting an overlap", async () => {
    expect((await book({ providerId: 1, patientId: 2, start: NINE_AM_CHICAGO })).status).toBe(409);
    const rows = ctx.db
      .prepare("SELECT COUNT(*) AS n FROM appointments WHERE provider_id = 1 AND status = 'booked'")
      .get() as { n: number };
    expect(rows.n).toBe(1);
  });

  it("compares UTC times, not clinic-local times, when checking overlaps", async () => {
    // 15:00 Chicago is 21:00Z; its local wall time matches the existing 15:00Z booking.
    expect((await book({ providerId: 1, patientId: 2, start: "2030-01-07T21:00:00.000Z" })).status).toBe(201);
  });

  it("allows a different provider at the same time", async () => {
    expect((await book({ providerId: 2, patientId: 2, start: "2030-01-07T16:00:00.000Z" })).status).toBe(201);
  });
});

describe("DELETE /appointments/:id", () => {
  it("cancels an appointment and frees the slot", async () => {
    const booked = await book({ providerId: 1, patientId: 1, start: NINE_AM_CHICAGO });
    const id = booked.body.appointment.id;

    const res = await request(ctx.app).delete(`/appointments/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.appointment).toMatchObject({ id, status: "cancelled" });
    expect(res.body.appointment.cancelledAt).toBeTruthy();

    expect(await slotStarts(1)).toContain(NINE_AM_CHICAGO);
    expect((await book({ providerId: 1, patientId: 2, start: NINE_AM_CHICAGO })).status).toBe(201);
  });

  it("returns 409 when already cancelled and 404 when unknown", async () => {
    const booked = await book({ providerId: 1, patientId: 1, start: NINE_AM_CHICAGO });
    const id = booked.body.appointment.id;
    expect((await request(ctx.app).delete(`/appointments/${id}`)).status).toBe(200);
    expect((await request(ctx.app).delete(`/appointments/${id}`)).status).toBe(409);
    expect((await request(ctx.app).delete("/appointments/12345")).status).toBe(404);
  });
});

describe("visit context and Epic metrics", () => {
  it("enriches visit context with contact details, care team, and clinical resources", async () => {
    const booked = await book({ providerId: 1, patientId: 3, start: NINE_AM_CHICAGO });
    const visitId = booked.body.appointment.id;

    const context = await request(ctx.app).get(`/visits/${visitId}/context`);
    expect(context.status).toBe(200);
    expect(context.body.patient).toMatchObject({ resourceType: "Patient", id: "ePAT-5003" });
    expect(context.body.practitioner.id).toBe("ePRAC-1001");
    expect(context.body.location.id).toBe("eLOC-CHI-001");
    expect(context.body.allergies).toHaveLength(2);
    expect(context.body.medications).toHaveLength(1);
    expect(context.body.contactDetails).toMatchObject({
      patientReference: "Patient/ePAT-5003",
      telecom: context.body.patient.telecom,
    });
    expect(context.body.careTeam.map((member: { id: string }) => member.id)).toEqual([
      "ePRAC-1001", "ePRAC-1002",
    ]);
    expect(context.body.epic.calls).toBe(8);

    const metrics = await request(ctx.app).get("/metrics/epic");
    expect(metrics.body).toMatchObject({
      totalCalls: 8,
      byResource: { Patient: 3, Practitioner: 2, Location: 1, AllergyIntolerance: 1, MedicationRequest: 1 },
      byTag: { fhir: 6, private: 2 },
      byVisit: { [String(visitId)]: 8 },
      averageCallsPerVisit: 8,
      meteredCostUsd: 0.08,
    });
  });

  it("loads each care team member in order and refreshes context on each request", async () => {
    const booked = await book({ providerId: 2, patientId: 3, start: "2030-01-07T16:00:00.000Z" });
    expect(booked.status).toBe(201);
    const visitId = booked.body.appointment.id;
    const original = ctx.epic.getPractitioner.bind(ctx.epic);
    let active = 0;
    let maxActive = 0;
    const practitioner = vi.spyOn(ctx.epic, "getPractitioner").mockImplementation(async (id, callCtx) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        return await original(id, callCtx);
      } finally {
        active -= 1;
      }
    });
    const patient = vi.spyOn(ctx.epic, "getPatient");
    const location = vi.spyOn(ctx.epic, "getLocation");
    const privateAllergies = vi.spyOn(ctx.epic, "getPrivateAllergies");
    const fhirAllergies = vi.spyOn(ctx.epic, "searchAllergyIntolerance");

    for (let i = 0; i < 2; i += 1) {
      const response = await request(ctx.app).get(`/visits/${visitId}/context`);
      expect(response.status).toBe(200);
      expect(response.body.practitioner.id).toBe("ePRAC-1002");
    }
    expect(maxActive).toBe(1);
    expect(practitioner.mock.calls.map(([id]) => id)).toEqual([
      "ePRAC-1001", "ePRAC-1002", "ePRAC-1001", "ePRAC-1002",
    ]);
    expect(patient).toHaveBeenCalledTimes(6);
    for (const call of patient.mock.calls) expect(call).toEqual(["ePAT-5003", { visitId }]);
    expect(location).toHaveBeenCalledTimes(2);
    expect(privateAllergies).toHaveBeenCalledTimes(2);
    expect(fhirAllergies).not.toHaveBeenCalled();
    expect(ctx.epic.metrics.snapshot()).toMatchObject({
      totalCalls: 16,
      byVisit: { [String(visitId)]: 16 },
      meteredCostUsd: 0.16,
    });
  });

  it("returns 404 for an unknown visit", async () => {
    expect((await request(ctx.app).get("/visits/999/context")).status).toBe(404);
    expect((await request(ctx.app).get("/metrics/epic")).body.totalCalls).toBe(0);
  });
});
