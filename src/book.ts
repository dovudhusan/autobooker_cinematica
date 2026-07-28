import type { CinematicaApi } from "./api.js";
import { config } from "./config.js";
import { describeSeat } from "./seats.js";
import type { FoundSeat, HoldResult } from "./types.js";

export async function holdSeat(
  api: CinematicaApi,
  found: FoundSeat,
): Promise<{ hold: HoldResult; paymentUrl?: string }> {
  const payload = {
    email: config.email,
    phone: config.phoneE164,
    seats: [
      {
        row: String(found.seat.row),
        number: found.seat.number,
        type: found.seat.type,
        d: "",
      },
    ],
    repertory_id: found.session.id,
    hall_id: found.session.hall_id,
    cinema_id: found.session.cinema_id,
    platform: "web" as const,
  };

  if (config.dryRun) {
    console.log("[dry-run] would hold:", {
      ...payload,
      session: `${found.session.date} ${found.session.time} ${found.session.hall}`,
      seat: describeSeat(found.seat),
      url: api.sessionUrl(found.session),
    });
    return {
      hold: { payment_id: "dry-run", url: api.sessionUrl(found.session) },
      paymentUrl: api.sessionUrl(found.session),
    };
  }

  const hold = await api.holdWithDis(payload);
  return { hold, paymentUrl: api.paymentPageUrl(hold) };
}

function seatDetails(found: FoundSeat, sessionUrl: string): string[] {
  return [
    `Movie: Одиссея`,
    `Cinema: ${found.session.cinema}`,
    `Hall: ${found.session.hall}`,
    `Date/time: ${found.session.date} ${found.session.time}`,
    `Seat: ${describeSeat(found.seat)}`,
    `Price: ${found.session.price} so'm`,
    "",
    `Open: ${sessionUrl}`,
  ];
}

export function successMessage(
  found: FoundSeat,
  paymentUrl: string | undefined,
  sessionUrl: string,
): string {
  const lines = [
    "✅ Cinematica: seat held (~10 min) — pay now!",
    "",
    ...seatDetails(found, sessionUrl),
  ];
  if (paymentUrl && paymentUrl !== sessionUrl) lines.push(`Pay: ${paymentUrl}`);
  lines.push("", "Finish Click/Payme before the timer ends.");
  return lines.join("\n");
}

/** Preferred seat is free, but auto-hold failed — book manually. */
export function availableMessage(found: FoundSeat, sessionUrl: string, reason?: string): string {
  const lines = [
    "🎟 Cinematica: preferred seat is FREE — book it manually!",
    "",
    ...seatDetails(found, sessionUrl),
  ];
  if (reason) {
    lines.push("", `Auto-hold failed: ${reason}`);
  }
  lines.push("", "Tap the link, pick that seat, Купить → Оплатить, then pay within ~10 min.");
  return lines.join("\n");
}
