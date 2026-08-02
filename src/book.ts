import type { CinematicaApi } from "./api.js";
import { config } from "./config.js";
import type { CheckoutUrls } from "./paycom.js";
import { describeSeats } from "./seats.js";
import type { FoundSeat, HoldResult } from "./types.js";

export async function holdSeats(
  api: CinematicaApi,
  found: FoundSeat,
): Promise<{ hold: HoldResult; paymentUrl?: string; checkout?: CheckoutUrls }> {
  const payload = {
    email: config.email,
    phone: config.phoneE164,
    seats: found.seats.map((seat) => ({
      row: String(seat.row),
      number: seat.number,
      type: seat.type,
      d: "",
    })),
    repertory_id: found.session.id,
    hall_id: found.session.hall_id,
    cinema_id: found.session.cinema_id,
    platform: "web" as const,
  };

  const sessionUrl = api.sessionUrl(found.target.pageId, found.session);

  if (config.dryRun) {
    console.log("[dry-run] would hold:", {
      ...payload,
      session: `${found.session.date} ${found.session.time} ${found.session.hall}`,
      seats: describeSeats(found.seats),
      url: sessionUrl,
    });
    return {
      hold: { payment_id: "dry-run", url: sessionUrl },
      paymentUrl: sessionUrl,
    };
  }

  const hold = await api.holdWithDis(payload);
  const status = hold.payment_id ? await api.getPaymentStatus(hold.payment_id) : "unknown";
  if (status !== "pending") {
    throw new Error(`Hold not active (status: ${status})`);
  }

  const checkout = await api.resolveCheckout(hold);
  const paymentUrl = api.checkoutUrl(hold, checkout);
  if (!paymentUrl) {
    throw new Error("Could not resolve Payme/Click checkout URL");
  }

  return { hold, paymentUrl, checkout };
}

function seatDetails(found: FoundSeat, sessionUrl: string): string[] {
  return [
    `Movie: ${found.movieTitle} (${found.target.label})`,
    `Cinema: ${found.session.cinema}`,
    `Hall: ${found.session.hall}`,
    `Date/time: ${found.session.date} ${found.session.time}`,
    `Seats: ${describeSeats(found.seats)}`,
    `Price: ${found.session.price} so'm × ${found.seats.length}`,
    "",
    `Open: ${sessionUrl}`,
  ];
}

export function successMessage(
  found: FoundSeat,
  paymentUrl: string | undefined,
  sessionUrl: string,
): string {
  const n = found.seats.length;
  const lines = [
    `✅ Cinematica: ${n} seat${n > 1 ? "s" : ""} held (~10 min) — pay now!`,
    "",
    ...seatDetails(found, sessionUrl),
  ];
  if (paymentUrl && paymentUrl !== sessionUrl) {
    if (paymentUrl.includes("checkout.paycom.uz")) lines.push(`Payme: ${paymentUrl}`);
    else if (paymentUrl.includes("click.uz")) lines.push(`Click: ${paymentUrl}`);
    else lines.push(`Pay: ${paymentUrl}`);
  }
  lines.push("", "Open Payme link and finish payment before the timer ends.");
  return lines.join("\n");
}

/** Preferred seats are free — notify before hold, or notify-only mode. */
export function availableMessage(
  found: FoundSeat,
  sessionUrl: string,
  opts?: { reason?: string; notifyOnly?: boolean },
): string {
  const n = found.seats.length;
  const reason = opts?.reason;
  const notifyOnly = opts?.notifyOnly ?? found.target.mode === "notify";
  let headline: string;
  if (reason) {
    headline = `🎟 Cinematica: preferred ${n} seat${n > 1 ? "s are" : " is"} FREE — book manually!`;
  } else if (notifyOnly) {
    headline = `🎟 Cinematica: best ${n} seat${n > 1 ? "s are" : " is"} FREE — book manually!`;
  } else {
    headline = `🎟 Cinematica: best ${n} seat${n > 1 ? "s are" : " is"} FREE — booking now!`;
  }
  const lines = [headline, "", ...seatDetails(found, sessionUrl)];
  if (reason) {
    lines.push("", `Auto-hold failed: ${reason}`);
  }
  if (reason || notifyOnly) {
    lines.push("", "Tap the link, pick those seats, Купить → Оплатить, then pay within ~10 min.");
  }
  return lines.join("\n");
}

export function newSessionMessage(
  label: string,
  movieTitle: string,
  session: { date: string; time: string; cinema: string; hall: string; price: string },
  sessionUrl: string,
  bestSeats?: string,
): string {
  const lines = [
    `🆕 Cinematica: new session opened (${label})`,
    "",
    `Movie: ${movieTitle}`,
    `Cinema: ${session.cinema}`,
    `Hall: ${session.hall}`,
    `Date/time: ${session.date} ${session.time}`,
    `Price: ${session.price} so'm`,
  ];
  if (bestSeats) lines.push(`Best seats free: ${bestSeats}`);
  lines.push("", `Open: ${sessionUrl}`);
  return lines.join("\n");
}
