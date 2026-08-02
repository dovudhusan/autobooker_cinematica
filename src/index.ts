import { CinematicaApi } from "./api.js";
import { availableMessage, holdSeats, newSessionMessage, successMessage } from "./book.js";
import { config } from "./config.js";
import { describeSeats, filterSessions, pickPreferredSeats } from "./seats.js";
import { notifyTelegram } from "./telegram.js";
import type { FoundSeat, MovieTarget, RepertorySession } from "./types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Avoid spamming Telegram if the same seats stay free. */
const alertCooldownMs = 5 * 60 * 1000;
const lastAvailabilityAlert = new Map<string, number>();
/** Book-mode targets that already held successfully. */
const completedBookTargets = new Set<string>();
/**
 * Known session ids per target. First successful scan seeds without "new session" alerts.
 */
const knownSessions = new Map<string, Set<number>>();
const seededTargets = new Set<string>();

function targetKey(target: MovieTarget): string {
  return `${target.pageId}:${target.mode}${target.date ? `@${target.date}` : ""}`;
}

function alertKey(found: FoundSeat): string {
  const seats = found.seats.map((s) => `${s.row}:${s.number}`).join(",");
  return `${found.target.pageId}:${found.session.id}:${seats}`;
}

async function notifyAvailability(
  found: FoundSeat,
  sessionUrl: string,
  opts?: { reason?: string; force?: boolean },
): Promise<void> {
  const key = alertKey(found) + (opts?.reason ? ":fail" : ":free");
  const last = lastAvailabilityAlert.get(key) ?? 0;
  if (!opts?.force && Date.now() - last < alertCooldownMs) {
    console.log("[telegram] availability alert skipped (cooldown)");
    return;
  }
  lastAvailabilityAlert.set(key, Date.now());
  const msg = availableMessage(found, sessionUrl, {
    reason: opts?.reason,
    notifyOnly: found.target.mode === "notify",
  });
  console.log("\n" + msg + "\n");
  await notifyTelegram(msg);
}

type ScanResult = {
  found: FoundSeat | null;
  newSessions: Array<{
    session: RepertorySession;
    movieTitle: string;
    bestSeats?: string;
    sessionUrl: string;
  }>;
};

async function scanTarget(api: CinematicaApi, target: MovieTarget): Promise<ScanResult> {
  const key = targetKey(target);
  if (target.mode === "book" && completedBookTargets.has(key)) {
    return { found: null, newSessions: [] };
  }

  const sessions = filterSessions(await api.getSessions(target.pageId), target.date);
  console.log(
    `[scan ${target.label}/${target.mode}] ${sessions.length} sessions` +
      (target.date ? ` on ${target.date}` : " (any date)") +
      ` in ${config.timeFrom}–${config.timeTo}` +
      ` | halls=${config.hallPreference}` +
      ` | seats=${config.seatCount}`,
  );

  if (sessions.length === 0) {
    console.log(`  • no matching Avalon Atmos showtimes yet`);
    return { found: null, newSessions: [] };
  }

  const known = knownSessions.get(key) ?? new Set<number>();
  const isSeeded = seededTargets.has(key);
  const newSessions: ScanResult["newSessions"] = [];
  let found: FoundSeat | null = null;

  for (const session of sessions) {
    const isNew = isSeeded && !known.has(session.id);
    try {
      const seats = await api.getSeats(session);
      const picked = pickPreferredSeats(seats);
      const vacantCount = seats.vacant_seats.length;
      const title = seats.repertory.movie_ru || seats.repertory.movie || target.label;
      const sessionUrl = api.sessionUrl(target.pageId, session);
      console.log(
        `  • ${session.date} ${session.time} | ${session.hall} | vacant=${vacantCount}` +
          (isNew ? " | NEW" : "") +
          (picked ? ` | HIT ${describeSeats(picked.seats)} (rank ${picked.preferenceRank})` : ""),
      );

      if (isNew) {
        newSessions.push({
          session,
          movieTitle: title,
          bestSeats: picked ? describeSeats(picked.seats) : undefined,
          sessionUrl,
        });
      }

      if (picked && !found) {
        found = {
          target,
          session,
          seats: picked.seats,
          preferenceRank: picked.preferenceRank,
          movieTitle: title,
        };
      }
    } catch (err) {
      console.warn(`  ! ${session.date} ${session.time} ${session.hall}:`, (err as Error).message);
      if (isNew) {
        newSessions.push({
          session,
          movieTitle: target.label,
          sessionUrl: api.sessionUrl(target.pageId, session),
        });
      }
    }
    known.add(session.id);
  }

  knownSessions.set(key, known);
  if (!isSeeded) {
    seededTargets.add(key);
    console.log(`  • seeded ${known.size} known sessions (no new-session alerts this pass)`);
  }

  return { found, newSessions };
}

async function handleNotifyOnly(api: CinematicaApi, found: FoundSeat): Promise<void> {
  const sessionUrl = api.sessionUrl(found.target.pageId, found.session);
  try {
    await notifyAvailability(found, sessionUrl);
  } catch (tgErr) {
    console.error("[telegram] notify failed:", (tgErr as Error).message);
  }
}

async function handleBook(api: CinematicaApi, found: FoundSeat): Promise<boolean> {
  const sessionUrl = api.sessionUrl(found.target.pageId, found.session);

  if (config.notifyBeforeHold) {
    try {
      await notifyAvailability(found, sessionUrl);
    } catch (tgErr) {
      console.error("[telegram] pre-hold notify failed:", (tgErr as Error).message);
    }
  }

  try {
    const { hold, paymentUrl } = await holdSeats(api, found);
    const msg = successMessage(found, paymentUrl, sessionUrl);
    console.log("\n" + msg + "\n");
    console.log("[hold response]", JSON.stringify(hold).slice(0, 500));
    try {
      await notifyTelegram(msg);
    } catch (tgErr) {
      console.error("[telegram] failed:", (tgErr as Error).message);
    }
    completedBookTargets.add(targetKey(found.target));
    return true;
  } catch (holdErr) {
    const reason = (holdErr as Error).message;
    console.error("[hold] failed:", reason);
    try {
      await notifyAvailability(found, sessionUrl, { reason, force: true });
    } catch (tgErr) {
      console.error("[telegram] failed:", (tgErr as Error).message);
    }
    return false;
  }
}

async function notifyNewSessions(
  target: MovieTarget,
  items: ScanResult["newSessions"],
): Promise<void> {
  for (const item of items) {
    const msg = newSessionMessage(
      target.label,
      item.movieTitle,
      item.session,
      item.sessionUrl,
      item.bestSeats,
    );
    console.log("\n" + msg + "\n");
    try {
      await notifyTelegram(msg);
    } catch (tgErr) {
      console.error("[telegram] new-session notify failed:", (tgErr as Error).message);
    }
  }
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");

  console.log("=== Cinematica autobooker ===");
  console.log(
    `Targets: ${config.movieTargets
      .map((t) => `${t.label}#${t.pageId}${t.date ? `@${t.date}` : ""}:${t.mode}`)
      .join(", ")}`,
  );
  console.log(`Window: ${config.timeFrom}–${config.timeTo} | seats=${config.seatCount}`);
  console.log(`Hall: ${config.hallPreference} | notifyBeforeHold=${config.notifyBeforeHold}`);
  console.log(`Email: ${config.email} | Phone: ${config.phoneE164}`);
  console.log(`DRY_RUN=${config.dryRun} | poll every ${config.pollIntervalMs / 1000}s`);
  if (once) console.log("Mode: single scan (--once)");
  console.log("");

  const api = new CinematicaApi();
  for (const target of config.movieTargets) {
    await api.initSession(target.pageId);
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const started = Date.now();
    let booked = false;

    try {
      for (const target of config.movieTargets) {
        const { found, newSessions } = await scanTarget(api, target);

        if (newSessions.length > 0) {
          await notifyNewSessions(target, newSessions);
        }

        if (!found) continue;

        if (target.mode === "notify") {
          // Skip duplicate "best seats" ping if we already included them in a new-session alert this pass
          const coveredByNew = newSessions.some(
            (n) => n.session.id === found.session.id && n.bestSeats,
          );
          if (!coveredByNew) await handleNotifyOnly(api, found);
        } else {
          const ok = await handleBook(api, found);
          if (ok) booked = true;
        }
      }

      const bookTargets = config.movieTargets.filter((t) => t.mode === "book");
      const bookRemaining = bookTargets.filter((t) => !completedBookTargets.has(targetKey(t)));
      const notifyTargets = config.movieTargets.filter((t) => t.mode === "notify");

      if (bookRemaining.length === 0 && bookTargets.length > 0 && config.stopOnSuccess) {
        if (notifyTargets.length === 0) {
          console.log("Done — all book targets held. Exiting.");
          return;
        }
        // Keep polling notify-only targets (e.g. RU new sessions)
        console.log(
          `[scan] ENG booked — still watching notify targets: ${notifyTargets.map((t) => t.label).join(", ")}`,
        );
      }

      if (!booked && bookRemaining.length > 0) {
        console.log(
          `[scan] waiting to book: ${bookRemaining.map((t) => t.label).join(", ")}`,
        );
      }
      if (notifyTargets.length > 0) {
        console.log(
          `[scan] watching for new RU sessions / best seats: ${notifyTargets.map((t) => t.label).join(", ")}`,
        );
      }

      if (once) {
        console.log(booked ? "Done (--once)." : "Done (--once) — no book action.");
        return;
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
