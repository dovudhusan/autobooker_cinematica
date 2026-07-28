# Cinematica autobooker

Watches [cinematica.uz/movies/948](https://cinematica.uz/movies/948) (Одиссея) for your preferred center seats, holds **one** seat for ~10 minutes via Click/Payme checkout, then pings Telegram so you can pay yourself.

## Seat priority (one seat)

1. Favorites: row **7** seats **13**, **14** → row **8** seats **17**, **16**
2. Fallbacks: row **7** seats **12**, **11**, **15** → row **8** seats **18**, **15**, **14**

Halls: **IMAX only** by default (`HALL_PREFERENCE=imax`) — your seat numbers are IMAX-center. Set `atmos` or `all` to widen. VIP needs `ALLOW_VIP=true`.

Showtimes: only starts in **19:00–00:00**, any listed day (today/tomorrow from the API).

## Setup

```bash
npm install
cp .env.example .env
```

Fill `.env`:

| Variable | Purpose |
|----------|---------|
| `BOOKING_EMAIL` / `BOOKING_PHONE` | Checkout contact (Uzbek `+998…`) |
| `TELEGRAM_BOT_TOKEN` | From [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | Your user id or group id |
| `DRY_RUN` | `true` = scan only; `false` = actually hold |
| `HALL_PREFERENCE` | `imax` (default), `atmos`, or `all` |

### Telegram

1. Message `@BotFather` → `/newbot` → copy token into `TELEGRAM_BOT_TOKEN`
2. Add the bot to your group (or DM it)
3. For a group: send a message, then open  
   `https://api.telegram.org/bot<TOKEN>/getUpdates`  
   and copy `chat.id` into `TELEGRAM_CHAT_ID` (groups are often negative)

## Run

```bash
# Safe: only checks availability
npm run watch

# Real hold (~10 min timer) + Telegram
# set DRY_RUN=false in .env first
npm run book
```

`npm run once` runs a single scan cycle and exits (still respects `DRY_RUN`).

## Flow

1. Poll `/api/v1/repertory/movie/948/grouped`
2. Filter evening showtimes → fetch seat maps
3. Pick first free seat from your priority list
4. `POST /api/v1/payment/dis` with email + phone (same as site “Оплатить”)
5. Telegram: hall, time, seat, pay link — **you** finish Click/Payme before the timer ends

## Deploy (24/7)

This is a **long-running worker**, not a website. Use Railway or Render (not Vercel serverless).

### Option A — Railway (recommended)

1. Push this repo to GitHub (do **not** commit `.env`)
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
3. Railway will build the `Dockerfile`
4. In **Variables**, paste the same keys as `.env` (`TELEGRAM_*`, `BOOKING_*`, `DRY_RUN`, etc.)
5. Deploy → check logs for `[scan] …`

CLI alternative:

```bash
npm i -g @railway/cli
railway login
railway init
railway variables set DRY_RUN=true TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=...
# …set the rest of the env vars
railway up
```

### Option B — Render

1. Push to GitHub
2. [Render](https://render.com) → **New** → **Background Worker** (or Blueprint with `render.yaml`)
3. Set env vars in the dashboard
4. Deploy

When a seat is held, Telegram notifies you — pay within ~10 minutes. With `STOP_ON_SUCCESS=true` the worker exits after one hold; restart it (or set `STOP_ON_SUCCESS=false`) if you want it to keep running.

## Notes

- No login required (guest checkout).
- Keep `DRY_RUN=true` until Telegram works and you’ve confirmed a preferred seat is free.
- Holding a seat starts a real ~10‑minute reservation — only disable dry-run when you’re ready to pay.
- Never commit `.env` (tokens). If a bot token was shared, regenerate it with [@BotFather](https://t.me/BotFather).
# autobooker_cinematica
