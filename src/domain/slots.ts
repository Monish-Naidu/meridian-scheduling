import { DateTime } from "luxon";

export interface WorkSchedule {
  workStart: string;
  workEnd: string;
  workDays: number[];
  slotMinutes: number;
}

export interface Interval {
  startUtc: string;
  endUtc: string;
}

export interface Slot {
  start: string;
  end: string;
  localStart: string;
  localEnd: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseLocalDate(date: string, timezone: string): DateTime | null {
  if (!DATE_RE.test(date)) return null;
  const day = DateTime.fromISO(date, { zone: timezone });
  return day.isValid ? day.startOf("day") : null;
}

export function toUtcIso(dt: DateTime): string {
  return dt.toUTC().toISO({ suppressMilliseconds: false }) as string;
}

/** Working-hour window for a clinic-local date, or null if the provider does not work that weekday. */
export function workingWindow(
  schedule: WorkSchedule,
  timezone: string,
  date: string,
): { start: DateTime; end: DateTime } | null {
  const day = parseLocalDate(date, timezone);
  if (!day || !schedule.workDays.includes(day.weekday)) return null;
  const start = DateTime.fromISO(`${date}T${schedule.workStart}`, { zone: timezone });
  const end = DateTime.fromISO(`${date}T${schedule.workEnd}`, { zone: timezone });
  return { start, end };
}

/**
 * Free slots for one clinic-local date. Slot boundaries are computed in the clinic's
 * timezone and converted to UTC, so DST transitions shift the UTC times, not the local ones.
 */
export function generateSlots(
  schedule: WorkSchedule,
  timezone: string,
  date: string,
  booked: Interval[],
  now: Date,
): Slot[] {
  const window = workingWindow(schedule, timezone, date);
  if (!window) return [];

  const busy = booked.map((b) => ({ start: Date.parse(b.startUtc), end: Date.parse(b.endUtc) }));
  const nowMs = now.getTime();
  const slots: Slot[] = [];

  for (
    let cursor = window.start;
    cursor.plus({ minutes: schedule.slotMinutes }) <= window.end;
    cursor = cursor.plus({ minutes: schedule.slotMinutes })
  ) {
    const slotEnd = cursor.plus({ minutes: schedule.slotMinutes });
    const s = cursor.toMillis();
    const e = slotEnd.toMillis();
    if (s < nowMs) continue;
    if (busy.some((b) => b.start < e && b.end > s)) continue;
    slots.push({
      start: toUtcIso(cursor),
      end: toUtcIso(slotEnd),
      localStart: cursor.toISO() as string,
      localEnd: slotEnd.toISO() as string,
    });
  }
  return slots;
}
