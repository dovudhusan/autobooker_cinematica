export type SeatPref = { row: number; number: number };

/** Adjacent center pairs for Avalon Atmos (~17 seats/row, smaller than IMAX). */
export type SeatPairPref = { row: number; numbers: [number, number] };

/**
 * Best viewing first: mid-back rows, true center (8+9), then near-center.
 * Agent books the first free adjacent pair.
 */
export const ATMOS_PAIR_PRIORITY: SeatPairPref[] = [
  // Favorites
  { row: 6, numbers: [8, 9] },
  { row: 7, numbers: [8, 9] },
  { row: 5, numbers: [8, 9] },
  // Near-center same rows
  { row: 6, numbers: [9, 10] },
  { row: 6, numbers: [7, 8] },
  { row: 7, numbers: [9, 10] },
  { row: 7, numbers: [7, 8] },
  { row: 5, numbers: [9, 10] },
  { row: 5, numbers: [7, 8] },
  // Row 8 (14 seats — center ~7+8) / row 4 / row 9
  { row: 8, numbers: [7, 8] },
  { row: 4, numbers: [8, 9] },
  { row: 8, numbers: [6, 7] },
  { row: 8, numbers: [8, 9] },
  { row: 9, numbers: [9, 10] },
  { row: 4, numbers: [9, 10] },
  { row: 4, numbers: [7, 8] },
];

/** Legacy single-seat IMAX list (kept for reference / single-seat mode). */
export const SEAT_PRIORITY: SeatPref[] = [
  { row: 7, number: 13 },
  { row: 7, number: 14 },
  { row: 8, number: 17 },
  { row: 8, number: 16 },
  { row: 7, number: 12 },
  { row: 7, number: 11 },
  { row: 7, number: 15 },
  { row: 8, number: 18 },
  { row: 8, number: 15 },
  { row: 8, number: 14 },
];

export type TargetMode = "notify" | "book";

export type MovieTarget = {
  pageId: string;
  /** Optional date filter, API form DD.MM.YY e.g. 06.08.26 */
  date?: string;
  /** notify = Telegram only; book = notify then hold */
  mode: TargetMode;
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
