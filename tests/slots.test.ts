import { describe, expect, it } from "vitest";
import { generateSlots, type WorkSchedule } from "../src/domain/slots";
import { PROVIDERS } from "../src/db/seed-data";
import { FIXED_NOW, MONDAY } from "./helpers";

const byId = (id: number): WorkSchedule => {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) throw new Error(`no provider ${id}`);
  return p;
};

describe("generateSlots", () => {
  it("produces every slot in a Chicago working day, converted to UTC", () => {
    const slots = generateSlots(byId(1), "America/Chicago", MONDAY, [], FIXED_NOW);
    expect(slots).toHaveLength(16); // 08:00-16:00 in 30 minute slots
    expect(slots[0]).toMatchObject({
      start: "2030-01-07T14:00:00.000Z",
      end: "2030-01-07T14:30:00.000Z",
      localStart: "2030-01-07T08:00:00.000-06:00",
    });
    expect(slots.at(-1)?.end).toBe("2030-01-07T22:00:00.000Z");
  });

  it("uses each clinic's timezone", () => {
    const la = generateSlots(byId(3), "America/Los_Angeles", MONDAY, [], FIXED_NOW);
    expect(la[0]?.start).toBe("2030-01-07T17:00:00.000Z");

    const ny = generateSlots(byId(5), "America/New_York", MONDAY, [], FIXED_NOW);
    expect(ny[0]?.start).toBe("2030-01-07T14:00:00.000Z");
    expect(ny).toHaveLength(8); // 09:00-15:00 in 45 minute slots
  });

  it("removes slots that intersect booked appointments", () => {
    const booked = [
      { startUtc: "2030-01-07T15:00:00.000Z", endUtc: "2030-01-07T15:30:00.000Z" },
      // Straddles two slots, so both disappear.
      { startUtc: "2030-01-07T16:15:00.000Z", endUtc: "2030-01-07T16:45:00.000Z" },
    ];
    const slots = generateSlots(byId(1), "America/Chicago", MONDAY, booked, FIXED_NOW);
    const starts = slots.map((s) => s.start);
    expect(slots).toHaveLength(13);
    expect(starts).not.toContain("2030-01-07T15:00:00.000Z");
    expect(starts).not.toContain("2030-01-07T16:00:00.000Z");
    expect(starts).not.toContain("2030-01-07T16:30:00.000Z");
    expect(starts).toContain("2030-01-07T15:30:00.000Z");
  });

  it("returns no slots on days the provider does not work", () => {
    expect(generateSlots(byId(1), "America/Chicago", "2030-01-05", [], FIXED_NOW)).toEqual([]);
    expect(generateSlots(byId(2), "America/Chicago", "2030-01-11", [], FIXED_NOW)).toEqual([]); // Friday
  });

  it("skips slots that have already started", () => {
    const now = new Date("2030-01-07T20:10:00.000Z"); // 14:10 in Chicago
    const slots = generateSlots(byId(1), "America/Chicago", MONDAY, [], now);
    expect(slots[0]?.start).toBe("2030-01-07T20:30:00.000Z");
    expect(slots).toHaveLength(3);
  });

  it("keeps local hours fixed across a DST change", () => {
    const everyDay: WorkSchedule = { workStart: "09:00", workEnd: "10:00", workDays: [1, 2, 3, 4, 5, 6, 7], slotMinutes: 30 };
    const past = new Date("2020-01-01T00:00:00.000Z");
    const beforeDst = generateSlots(everyDay, "America/Chicago", "2026-10-31", [], past);
    const afterDst = generateSlots(everyDay, "America/Chicago", "2026-11-01", [], past);
    expect(beforeDst[0]?.start).toBe("2026-10-31T14:00:00.000Z"); // CDT, UTC-5
    expect(afterDst[0]?.start).toBe("2026-11-01T15:00:00.000Z"); // CST, UTC-6
  });

  it("returns nothing for an invalid date", () => {
    expect(generateSlots(byId(1), "America/Chicago", "2030-02-30", [], FIXED_NOW)).toEqual([]);
  });
});
