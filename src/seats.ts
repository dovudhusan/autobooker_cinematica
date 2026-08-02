import { config } from "./config.js";
import { ATMOS_PAIR_PRIORITY, SEAT_PRIORITY } from "./types.js";
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
  if (h.includes("atmos")) return 0;
  if (h.includes("imax")) return 1;
  return 10;
}

export function hallAllowed(hallName: string): boolean {
  const rank = hallRank(hallName);
  if (rank >= 900) return false;
  const pref = config.hallPreference;
  if (pref === "all") return true;
  if (pref === "atmos") return hallName.toLowerCase().includes("atmos");
  // default / imax: IMAX only
  return hallName.toLowerCase().includes("imax");
}

export function filterSessions(
  sessions: RepertorySession[],
  dateFilter?: string,
): RepertorySession[] {
  return sessions
    .filter((s) => !s.is_disabled && !s.disable_sales && !s.disable_reservation)
    .filter((s) => (dateFilter ? s.date === dateFilter : true))
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

/** Pick first free adjacent center pair (Atmos), or single preferred seat if SEAT_COUNT=1. */
export function pickPreferredSeats(
  seats: SeatsResponse,
): { seats: SchemeSeat[]; preferenceRank: number } | null {
  const vacant = new Set(seats.vacant_seats.map((s) => s.id));
  const byKey = new Map<string, SchemeSeat>();
  for (const seat of flattenScheme(seats)) {
    byKey.set(`${seat.row}:${seat.number}`, seat);
  }

  if (config.seatCount <= 1) {
    for (let i = 0; i < SEAT_PRIORITY.length; i++) {
      const pref = SEAT_PRIORITY[i];
      const seat = byKey.get(`${pref.row}:${pref.number}`);
      if (seat && vacant.has(seat.id)) {
        return { seats: [seat], preferenceRank: i };
      }
    }
    return null;
  }

  for (let i = 0; i < ATMOS_PAIR_PRIORITY.length; i++) {
    const pref = ATMOS_PAIR_PRIORITY[i];
    const picked: SchemeSeat[] = [];
    for (const n of pref.numbers) {
      const seat = byKey.get(`${pref.row}:${n}`);
      if (!seat || !vacant.has(seat.id)) break;
      picked.push(seat);
    }
    if (picked.length === pref.numbers.length) {
      return { seats: picked, preferenceRank: i };
    }
  }
  return null;
}

/** @deprecated use pickPreferredSeats */
export function pickPreferredSeat(
  seats: SeatsResponse,
): FoundSeat["seats"][number] & { preferenceRank: number } | null {
  const picked = pickPreferredSeats(seats);
  if (!picked || picked.seats.length === 0) return null;
  return { ...picked.seats[0], preferenceRank: picked.preferenceRank };
}

export function describeSeat(seat: SchemeSeat): string {
  return `ряд ${seat.row}, место ${seat.number}`;
}

export function describeSeats(seats: SchemeSeat[]): string {
  if (seats.length === 1) return describeSeat(seats[0]);
  const rows = new Set(seats.map((s) => s.row));
  if (rows.size === 1) {
    const nums = seats.map((s) => s.number).join("+");
    return `ряд ${seats[0].row}, места ${nums}`;
  }
  return seats.map(describeSeat).join("; ");
}
