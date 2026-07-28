import { CinematicaApi } from "./api.js";
import { availableMessage, holdSeat, successMessage } from "./book.js";
import { config } from "./config.js";
import { describeSeat, filterSessions, pickPreferredSeat } from "./seats.js";
import { notifyTelegram } from "./telegram.js";
import type { FoundSeat } from "./types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Avoid spamming Telegram if hold keeps failing for the same seat. */
const alertCooldownMs = 5 * 60 * 1000;
const lastAvailabilityAlert = new Map<string, number>();

function alertKey(found: FoundSeat): string {
  return `${found.session.id}:${found.seat.row}:${found.seat.number}`;
}

async function notifyAvailability(found: FoundSeat, sessionUrl: string, reason?: string): Promise<void> {
  const key = alertKey(found);
  const last = lastAvailabilityAlert.get(key) ?? 0;
  if (Date.now() - last < alertCooldownMs) {
    console.log("[telegram] availability alert skipped (cooldown)");
    return;
  }
  lastAvailabilityAlert.set(key, Date.now());
  const msg = availableMessage(found, sessionUrl, reason);
  console.log("\n" + msg + "\n");
  await notifyTelegram(msg);
}

async function scanOnce(api: CinematicaApi): Promise<FoundSeat | null> {
  const sessions = filterSessions(await api.getSessions());
  console.log(
    `[scan] ${sessions.length} sessions in ${config.timeFrom}–${config.timeTo}` +
      ` | halls=${config.hallPreference}` +
      (config.allowVip ? " +VIP" : ""),
  );

  for (const session of sessions) {
    try {
      const seats = await api.getSeats(session);
      const picked = pickPreferredSeat(seats);
      const vacantCount = seats.vacant_seats.length;
      console.log(
        `  • ${session.date} ${session.time} | ${session.hall} | vacant=${vacantCount}` +
          (picked ? ` | HIT ${describeSeat(picked)} (rank ${picked.preferenceRank})` : ""),
      );
      if (picked) {
        return {
          session,
          seat: picked,
          preferenceRank: picked.preferenceRank,
        };
      }
    } catch (err) {
      console.warn(`  ! ${session.date} ${session.time} ${session.hall}:`, (err as Error).message);
    }
  }
  return null;
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");

  console.log("=== Cinematica autobooker ===");
  console.log(`Movie page: ${config.moviePageId}`);
  console.log(`Window: ${config.timeFrom}–${config.timeTo}`);
  console.log(`Email: ${config.email} | Phone: ${config.phoneE164}`);
  console.log(`DRY_RUN=${config.dryRun} | poll every ${config.pollIntervalMs / 1000}s`);
  if (once) console.log("Mode: single scan (--once)");
  console.log("");

  const api = new CinematicaApi();
  await api.initSession();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const started = Date.now();
    try {
      const found = await scanOnce(api);
      if (found) {
        const sessionUrl = api.sessionUrl(found.session);
        try {
          const { hold, paymentUrl } = await holdSeat(api, found);
          const msg = successMessage(found, paymentUrl, sessionUrl);
          console.log("\n" + msg + "\n");
          console.log("[hold response]", JSON.stringify(hold).slice(0, 500));
          try {
            await notifyTelegram(msg);
          } catch (tgErr) {
            console.error("[telegram] failed:", (tgErr as Error).message);
          }

          if (config.stopOnSuccess || once) {
            console.log("Done — exiting.");
            return;
          }
        } catch (holdErr) {
          const reason = (holdErr as Error).message;
          console.error("[hold] failed:", reason);
          try {
            await notifyAvailability(found, sessionUrl, reason);
          } catch (tgErr) {
            console.error("[telegram] failed:", (tgErr as Error).message);
          }
          if (once) return;
        }
      } else {
        console.log("[scan] no preferred seats free yet");
        if (once) {
          console.log("Done (--once) — no seat found.");
          return;
        }
      }
    } catch (err) {
      console.error("[loop] error:", (err as Error).message);
      if (once) process.exit(1);
    }

    const elapsed = Date.now() - started;
    const wait = Math.max(0, config.pollIntervalMs - elapsed);
    console.log(`[wait] ${Math.round(wait / 1000)}s…\n`);
    await sleep(wait);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
