import "dotenv/config";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { MovieTarget, TargetMode } from "./types.js";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing env ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Env ${name} must be a number`);
  return n;
}

const DEFAULT_LABELS: Record<string, string> = {
  "952": "Spider-Man RU",
  "954": "Spider-Man ENG",
};

/**
 * MOVIE_TARGETS examples:
 *   952:notify,954@2026-08-06:book
 *   952,954@2026-08-06
 * Format: pageId[@date][:notify|book]  (default mode = book)
 */
function parseMovieTargets(): MovieTarget[] {
  const raw = process.env.MOVIE_TARGETS?.trim() || process.env.MOVIE_PAGE_ID?.trim() || "952";
  return raw.split(",").map((part) => {
    const trimmed = part.trim();
    const match = trimmed.match(/^(\d+)(?:@([^:]+))?(?::(notify|book))?$/i);
    if (!match) throw new Error(`Bad MOVIE_TARGETS entry: ${part}`);
    const pageId = match[1];
    const dateRaw = match[2];
    const mode = (match[3]?.toLowerCase() ?? "book") as TargetMode;
    return {
      pageId,
      date: dateRaw ? normalizeApiDate(dateRaw) : undefined,
      mode,
      label: DEFAULT_LABELS[pageId] ?? `movie ${pageId}`,
    };
  });
}

/** Accept 2026-08-06 or 06.08.26 → API form 06.08.26 */
export function normalizeApiDate(input: string): string {
  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const yy = iso[1].slice(2);
    return `${iso[3]}.${iso[2]}.${yy}`;
  }
  const dotted = input.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (dotted) return input;
  throw new Error(`Bad date "${input}" — use YYYY-MM-DD or DD.MM.YY`);
}

const phoneRaw = required("BOOKING_PHONE", "+998901234567");
const phone = parsePhoneNumberFromString(phoneRaw, "UZ");
if (!phone?.isValid()) {
  throw new Error(`BOOKING_PHONE is invalid Uzbek number: ${phoneRaw}`);
}

export const config = {
  baseUrl: "https://cinematica.uz",
  movieTargets: parseMovieTargets(),
  /** @deprecated use movieTargets — kept for single-id callers */
  get moviePageId(): string {
    return this.movieTargets[0]?.pageId ?? "952";
  },
  email: required("BOOKING_EMAIL", "test@gmail.com"),
  phoneE164: phone.number,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN?.trim() || "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID?.trim() || "",
  pollIntervalMs: int("POLL_INTERVAL_SEC", 30) * 1000,
  timeFrom: required("TIME_FROM", "19:00"),
  timeTo: required("TIME_TO", "23:00"),
  allowVip: bool("ALLOW_VIP", false),
  /**
   * imax = PEPSI IMAX only
   * atmos = Avalon ATMOS only (default for Spider-Man)
   * all = every non-VIP hall (VIP still needs ALLOW_VIP=true)
   */
  hallPreference: (process.env.HALL_PREFERENCE || "atmos").toLowerCase(),
  /** How many adjacent center seats to hold (default 2). */
  seatCount: int("SEAT_COUNT", 2),
  /** Ping Telegram as soon as preferred seats are free, then attempt hold (book mode). */
  notifyBeforeHold: bool("NOTIFY_BEFORE_HOLD", true),
  dryRun: bool("DRY_RUN", true),
  /** Stop after every book-mode target has a successful hold (notify targets keep running). */
  stopOnSuccess: bool("STOP_ON_SUCCESS", true),
};
