export type SeatPref = { row: number; number: number };

/** Adjacent pairs for Avalon Atmos. */
export type SeatPairPref = { row: number; numbers: [number, number] };

/**
 * Russian Atmos: rows 5–6, seats 9–12 (adjacent pairs first).
 */
export const RU_ATMOS_PAIR_PRIORITY: SeatPairPref[] = [
  { row: 5, numbers: [9, 10] },
  { row: 5, numbers: [10, 11] },
  { row: 5, numbers: [11, 12] },
  { row: 6, numbers: [9, 10] },
  { row: 6, numbers: [10, 11] },
  { row: 6, numbers: [11, 12] },
  // Same band, non-adjacent fallbacks
  { row: 5, numbers: [9, 11] },
  { row: 5, numbers: [10, 12] },
  { row: 5, numbers: [9, 12] },
  { row: 6, numbers: [9, 11] },
  { row: 6, numbers: [10, 12] },
  { row: 6, numbers: [9, 12] },
];

/** @deprecated legacy IMAX center list */
export const SEAT_PRIORITY: SeatPref[] = [
  { row: 7, number: 13 },
  { row: 7, number: 14 },
  { row: 8, number: 17 },
  { row: 8, number: 16 },
];

export type TargetMode = "notify" | "book";
export type HallPreference = "atmos" | "imax" | "all";
/** preferred = fixed seat list; any = first vacant seats in the hall */
export type SeatStrategy = "preferred" | "any";

export type MovieTarget = {
  pageId: string;
  /** Optional date filter, API form DD.MM.YY e.g. 06.08.26 */
  date?: string;
  /** notify = Telegram only; book = notify then hold */
  mode: TargetMode;
  hallPreference: HallPreference;
  seatStrategy: SeatStrategy;
  label: string;
};

export type RepertorySession = {
  id: number;
  cinema_id: number;
  hall_id: number;
  movie_id: number;
  date: string;
  time: string;
  cinema: string;
  hall: string;
  price: string;
  disable_reservation: boolean;
  disable_sales: boolean;
  is_disabled: boolean;
};

export type SchemeSeat = {
  id: string;
  row: string;
  number: number;
  type: string;
  x: number;
  y: number;
};

export type SeatsResponse = {
  result: number;
  repertory: {
    cinema: string;
    hall: string;
    movie: string;
    movie_ru?: string;
    date: string;
    online_sale: boolean;
  };
  scheme: {
    rows: Array<{ order: string; seats: SchemeSeat[] }>;
  };
  vacant_seats: Array<{ id: string; price: number; type: string }>;
  reserved_seats: unknown[];
  prices: unknown[];
};

export type HoldParams = {
  operationid: number | string;
  amount: number | string;
  orderid: string;
  cinemaid: number | string;
  return_url: string;
  sign: string;
  phone: string;
  release: string;
  seance_date_time: number | string;
  ticket_url: string;
};

export type HoldPayload = {
  email: string;
  phone: string;
  seats: Array<{ row: string; number: number; type: string; d: string }>;
  repertory_id: number;
  hall_id: number;
  cinema_id: number;
  discount_card_code?: string;
  promocode_code?: string;
  platform: "web";
};

export type HoldResult = {
  payment_id?: string | number;
  url?: string;
  params?: HoldParams;
  message?: string;
  result?: number;
};

export type FoundSeat = {
  target: MovieTarget;
  session: RepertorySession;
  seats: SchemeSeat[];
  preferenceRank: number;
  movieTitle: string;
};
