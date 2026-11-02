import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
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
  it("makes five tagged Epic calls per visit and prices the private ones", async () => {
    const booked = await book({ providerId: 1, patientId: 3, start: NINE_AM_CHICAGO });
    const visitId = booked.body.appointment.id;

    const context = await request(ctx.app).get(`/visits/${visitId}/context`);
    expect(context.status).toBe(200);
    expect(context.body.patient).toMatchObject({ resourceType: "Patient", id: "ePAT-5003" });
    expect(context.body.practitioner.id).toBe("ePRAC-1001");
    expect(context.body.location.id).toBe("eLOC-CHI-001");
    expect(context.body.allergies).toHaveLength(2);
    expect(context.body.medications).toHaveLength(1);

    const metrics = await request(ctx.app).get("/metrics/epic");
    expect(metrics.body).toMatchObject({
      totalCalls: 5,
      byResource: { Patient: 1, Practitioner: 1, Location: 1, AllergyIntolerance: 1, MedicationRequest: 1 },
      byTag: { fhir: 3, private: 2 },
      byVisit: { [String(visitId)]: 5 },
      averageCallsPerVisit: 5,
      meteredCostUsd: 0.08,
    });
  });

  it("returns 404 for an unknown visit", async () => {
    expect((await request(ctx.app).get("/visits/999/context")).status).toBe(404);
    expect((await request(ctx.app).get("/metrics/epic")).body.totalCalls).toBe(0);
  });
});
