export type SeatPref = { row: number; number: number };

/** Favorites first, then other good center seats. Agent books exactly one. */
export const SEAT_PRIORITY: SeatPref[] = [
  // Favorites
  { row: 7, number: 13 },
  { row: 7, number: 14 },
  { row: 8, number: 17 },
  { row: 8, number: 16 },
  // Fallbacks (row 7 center band, then row 8)
  { row: 7, number: 12 },
  { row: 7, number: 11 },
  { row: 7, number: 15 },
  { row: 8, number: 18 },
  { row: 8, number: 15 },
  { row: 8, number: 14 },
];

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
  params?: unknown;
  message?: string;
  result?: number;
};

export type FoundSeat = {
  session: RepertorySession;
  seat: SchemeSeat;
  preferenceRank: number;
};
