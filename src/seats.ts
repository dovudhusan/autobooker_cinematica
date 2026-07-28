import { config } from "./config.js";
import { SEAT_PRIORITY } from "./types.js";
import type { FoundSeat, RepertorySession, SchemeSeat, SeatsResponse } from "./types.js";

/** Minutes from midnight. TIME_TO=00:00 means end of day (24:00). */
export function parseClock(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    throw new Error(`Bad time: ${hhmm}`);
  }
  return h * 60 + m;
}

export function isInTimeWindow(time: string, from = config.timeFrom, to = config.timeTo): boolean {
  const t = parseClock(time);
  const start = parseClock(from);
  let end = parseClock(to);
  // 00:00 as window end → treat as midnight (end of day)
  if (to === "00:00") end = 24 * 60;
  if (end > start) return t >= start && t < end;
  // overnight window e.g. 22:00–02:00
  return t >= start || t < end;
}

export function hallRank(hallName: string): number {
  const h = hallName.toLowerCase();
  if (h.includes("vip")) return config.allowVip ? 50 : 999;
  if (h.includes("imax")) return 0;
  if (h.includes("atmos")) return 1;
  return 10;
}

export function hallAllowed(hallName: string): boolean {
  const rank = hallRank(hallName);
  if (rank >= 900) return false;
  const pref = config.hallPreference;
  if (pref === "all") return true;
  if (pref === "atmos") return rank <= 1;
  // default: imax only — seat numbers 7/13–14 and 8/16–17 match IMAX center
  return hallName.toLowerCase().includes("imax");
}

export function filterSessions(sessions: RepertorySession[]): RepertorySession[] {
  return sessions
    .filter((s) => !s.is_disabled && !s.disable_sales && !s.disable_reservation)
    .filter((s) => isInTimeWindow(s.time))
    .filter((s) => hallAllowed(s.hall))
    .sort((a, b) => {
      const hall = hallRank(a.hall) - hallRank(b.hall);
      if (hall !== 0) return hall;
      const date = a.date.localeCompare(b.date);
      if (date !== 0) return date;
      return parseClock(a.time) - parseClock(b.time);
    });
}

export function flattenScheme(seats: SeatsResponse): SchemeSeat[] {
  return seats.scheme.rows.flatMap((row) => row.seats);
}

export function pickPreferredSeat(seats: SeatsResponse): FoundSeat["seat"] & { preferenceRank: number } | null {
  const vacant = new Set(seats.vacant_seats.map((s) => s.id));
  const byKey = new Map<string, SchemeSeat>();
  for (const seat of flattenScheme(seats)) {
    byKey.set(`${seat.row}:${seat.number}`, seat);
  }

  for (let i = 0; i < SEAT_PRIORITY.length; i++) {
    const pref = SEAT_PRIORITY[i];
    const seat = byKey.get(`${pref.row}:${pref.number}`);
    if (seat && vacant.has(seat.id)) {
      return { ...seat, preferenceRank: i };
    }
  }
  return null;
}

export function describeSeat(seat: SchemeSeat): string {
  return `ряд ${seat.row}, место ${seat.number}`;
}
