import "dotenv/config";
import { parsePhoneNumberFromString } from "libphonenumber-js";

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

const phoneRaw = required("BOOKING_PHONE", "+998901234567");
const phone = parsePhoneNumberFromString(phoneRaw, "UZ");
if (!phone?.isValid()) {
  throw new Error(`BOOKING_PHONE is invalid Uzbek number: ${phoneRaw}`);
}

export const config = {
  baseUrl: "https://cinematica.uz",
  moviePageId: required("MOVIE_PAGE_ID", "948"),
  email: required("BOOKING_EMAIL", "test@gmail.com"),
  phoneE164: phone.number,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN?.trim() || "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID?.trim() || "",
  pollIntervalMs: int("POLL_INTERVAL_SEC", 30) * 1000,
  timeFrom: required("TIME_FROM", "19:00"),
  timeTo: required("TIME_TO", "00:00"),
  allowVip: bool("ALLOW_VIP", false),
  /**
   * imax = PEPSI IMAX only (your preferred seat numbers are IMAX-center).
   * atmos = IMAX + ATMOS
   * all = every non-VIP hall (VIP still needs ALLOW_VIP=true)
   */
  hallPreference: (process.env.HALL_PREFERENCE || "imax").toLowerCase(),
  dryRun: bool("DRY_RUN", true),
  stopOnSuccess: bool("STOP_ON_SUCCESS", true),
};
