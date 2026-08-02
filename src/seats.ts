import { config } from "./config.js";
import { RU_ATMOS_PAIR_PRIORITY } from "./types.js";
import type {
  FoundSeat,
  HallPreference,
  MovieTarget,
  RepertorySession,
  SchemeSeat,
  SeatStrategy,
  SeatsResponse,
} from "./types.js";

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
  if (to === "00:00") end = 24 * 60;
  if (end > start) return t >= start && t < end;
  return t >= start || t < end;
}

export function hallRank(hallName: string, allowVip = config.allowVip): number {
  const h = hallName.toLowerCase();
  if (h.includes("vip")) return allowVip ? 50 : 999;
  if (h.includes("atmos")) return 0;
  if (h.includes("imax")) return 1;
  return 10;
}

export function hallAllowed(
  hallName: string,
  preference: HallPreference,
  allowVip = config.allowVip,
): boolean {
  const rank = hallRank(hallName, allowVip);
  if (rank >= 900) return false;
  if (preference === "all") return true;
  if (preference === "atmos") return hallName.toLowerCase().includes("atmos");
  return hallName.toLowerCase().includes("imax");
}

export function filterSessions(
  sessions: RepertorySession[],
  opts?: { date?: string; hallPreference?: HallPreference },
): RepertorySession[] {
  const hallPref = opts?.hallPreference ?? "atmos";
  return sessions
    .filter((s) => !s.is_disabled && !s.disable_sales && !s.disable_reservation)
    .filter((s) => (opts?.date ? s.date === opts.date : true))
    .filter((s) => isInTimeWindow(s.time))
    .filter((s) => hallAllowed(s.hall, hallPref))
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

function pickFromPairs(
  byKey: Map<string, SchemeSeat>,
  vacant: Set<string>,
  pairs: typeof RU_ATMOS_PAIR_PRIORITY,
): { seats: SchemeSeat[]; preferenceRank: number } | null {
  for (let i = 0; i < pairs.length; i++) {
    const pref = pairs[i];
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

/** Any vacant seats: prefer adjacent same-row pairs, else first N vacant. */
function pickAnySeats(
  seats: SeatsResponse,
  count: number,
): { seats: SchemeSeat[]; preferenceRank: number } | null {
  const vacantIds = new Set(seats.vacant_seats.map((s) => s.id));
  if (vacantIds.size < count) return null;

  const all = flattenScheme(seats).filter((s) => vacantIds.has(s.id));
  if (all.length < count) return null;

  if (count <= 1) {
    const seat = [...all].sort((a, b) => Number(a.row) - Number(b.row) || a.number - b.number)[0];
    return { seats: [seat], preferenceRank: 0 };
  }

  // Adjacent pairs in the same row (by seat number)
  const byRow = new Map<string, SchemeSeat[]>();
  for (const seat of all) {
    const list = byRow.get(seat.row) ?? [];
    list.push(seat);
    byRow.set(seat.row, list);
  }

  const rowKeys = [...byRow.keys()].sort((a, b) => Number(a) - Number(b));
  for (const row of rowKeys) {
    const rowSeats = byRow.get(row)!.sort((a, b) => a.number - b.number);
    for (let i = 0; i < rowSeats.length - 1; i++) {
      if (rowSeats[i + 1].number === rowSeats[i].number + 1) {
        return { seats: [rowSeats[i], rowSeats[i + 1]], preferenceRank: 0 };
      }
    }
  }

  // Fallback: any N vacant
  const picked = [...all]
    .sort((a, b) => Number(a.row) - Number(b.row) || a.number - b.number)
    .slice(0, count);
  return { seats: picked, preferenceRank: 100 };
}

export function pickPreferredSeats(
  seats: SeatsResponse,
  strategy: SeatStrategy = "preferred",
  seatCount = config.seatCount,
): { seats: SchemeSeat[]; preferenceRank: number } | null {
  if (strategy === "any") {
    return pickAnySeats(seats, seatCount);
  }

  const vacant = new Set(seats.vacant_seats.map((s) => s.id));
  const byKey = new Map<string, SchemeSeat>();
  for (const seat of flattenScheme(seats)) {
    byKey.set(`${seat.row}:${seat.number}`, seat);
  }

  if (seatCount <= 1) {
    for (let i = 0; i < RU_ATMOS_PAIR_PRIORITY.length; i++) {
      const pref = RU_ATMOS_PAIR_PRIORITY[i];
      for (const n of pref.numbers) {
        const seat = byKey.get(`${pref.row}:${n}`);
        if (seat && vacant.has(seat.id)) {
          return { seats: [seat], preferenceRank: i };
        }
      }
    }
    return null;
  }

  return pickFromPairs(byKey, vacant, RU_ATMOS_PAIR_PRIORITY);
}

export function pickForTarget(
  seats: SeatsResponse,
  target: MovieTarget,
): { seats: SchemeSeat[]; preferenceRank: number } | null {
  return pickPreferredSeats(seats, target.seatStrategy, config.seatCount);
}

/** @deprecated */
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
