# @brain/worker

Cloudflare Worker backend for **SophieBot** — SMS and Telegram assistant for shared restaurant lists, watchlists, and calendar coordination.

## Prerequisites

- Node.js 20+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- Cloudflare account with Workers + D1 enabled
- Twilio account (optional if using Telegram only)
- OpenAI API key
- Google Cloud OAuth credentials (Calendar read-only scope)

## Setup

### 1. Install dependencies

From the repo root:

```bash
npm install
npm run build -w @brain/shared
```

### 2. Create D1 database

```bash
cd apps/worker
npx wrangler d1 create brain-db
```

Copy the returned `database_id` into `wrangler.toml` under `[[d1_databases]]`.

### 3. Apply migrations

Local (for `wrangler dev`):

```bash
npm run db:migrate
```

Production:

```bash
npm run db:migrate:remote
```

Migrations include `0005_security.sql` (telegram verify poll tokens, rate-limit buckets, vote dedup index).

### 4. Configure secrets

Set these via Wrangler (never commit real values):

```bash
npx wrangler secret put TWILIO_ACCOUNT_SID
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put TWILIO_PHONE_NUMBER
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put ALLOWED_PHONES
npx wrangler secret put AUTH_SECRET
# Required when Telegram is enabled:
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put TELEGRAM_BOT_USERNAME
```

Update `[vars]` in `wrangler.toml`:

- `APP_URL` — worker URL (e.g. `https://brain-worker.sophiebot.workers.dev`)
- `WEB_URL` — dashboard URL (e.g. `https://sfkunal.github.io/SophieBot/`)
- `GOOGLE_REDIRECT_URI` — `{APP_URL}/api/auth/google/callback`

For local dev, create `.dev.vars` in `apps/worker/` (gitignored) with the same keys.

### 5. Twilio webhook

Point your Twilio number's **Messaging webhook** to:

```
POST https://<your-worker>/webhooks/twilio
```

### 6. Telegram webhook

Generate a webhook secret and set `TELEGRAM_WEBHOOK_SECRET`. The endpoint returns **503** without it.

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-worker>/webhooks/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Telegram sends the secret in the `X-Telegram-Bot-Api-Secret-Token` header; mismatches return 403.

### 7. Google OAuth

In Google Cloud Console, add authorized redirect URI:

```
https://<your-worker>/api/auth/google/callback
```

`GET /api/auth/google/start` requires an authenticated session (`Authorization: Bearer <token>`). The user is taken from the session — no `phone` query param.

## Development

```bash
npm run dev
# or from repo root:
npm run dev:worker
```

Health check: `GET http://localhost:8787/health`

## Testing

```bash
npm test
```

From repo root: `npm test` (runs worker Vitest suite). CI runs this on every push and PR via `.github/workflows/ci.yml`.

## Deploy

```bash
npm run deploy
```

CI deploys via `.github/workflows/deploy-worker.yml` on push to `main`.

## API routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/webhooks/twilio` | Inbound SMS pipeline |
| POST | `/webhooks/telegram` | Inbound Telegram pipeline (requires `TELEGRAM_WEBHOOK_SECRET`) |
| GET | `/api/auth/google/start` | Start Google OAuth (auth required) |
| GET | `/api/auth/google/callback` | OAuth callback |
| POST | `/api/onboard/verify` | Send phone verification SMS (rate limited) |
| POST | `/api/onboard/confirm` | Confirm SMS code + register user (rate limited) |
| POST | `/api/onboard/telegram-verify` | Start Telegram phone verification; returns `poll_token` |
| POST | `/api/onboard/telegram-verify/status` | Poll Telegram verify completion (`phone` + `poll_token`) |
| POST | `/api/telegram/link-code` | Generate Telegram link code (auth required) |
| GET | `/api/restaurants` | List restaurants (`?status=queued`) |
| GET | `/api/watch` | List watch items |
| GET | `/api/calendar/slots` | Mutual free slots this week |
| GET | `/health` | Health check |

## Message pipeline

1. Verify webhook signature (Twilio) or secret token (Telegram `X-Telegram-Bot-Api-Secret-Token`)
2. Check allowlist — SMS and API strictly use `ALLOWED_PHONES` (registered-but-delisted users lose access)
3. Load DB context (queue counts, recent items, conversation history)
4. OpenAI intent extraction (`gpt-4o-mini`)
5. Deterministic handler by intent
6. OpenAI reply composition (warm/funny personality)
7. Send reply + log to `inbound_messages`

## Cron

Friday 6pm UTC (`0 18 * * 5`) — weekly digest nudging stale queued items (30+ days).

## Rate limits

Onboard endpoints are rate limited per phone and client IP (15-minute windows):

| Endpoint | Per phone | Per IP |
|----------|-----------|--------|
| `POST /api/onboard/verify` | 5 | 20 |
| `POST /api/onboard/confirm` | 10 | 30 |
| `POST /api/onboard/telegram-verify` | 5 | 20 |

Exceeded limits return 429.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | if SMS | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | if SMS | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | if SMS | Outbound SMS from number (E.164) |
| `TELEGRAM_BOT_TOKEN` | if Telegram | Telegram bot token |
| `TELEGRAM_WEBHOOK_SECRET` | if Telegram | Webhook secret token (required; endpoint fails closed without it) |
| `TELEGRAM_BOT_USERNAME` | if Telegram | Bot username (without @) |
| `OPENAI_API_KEY` | yes | OpenAI API key |
| `GOOGLE_CLIENT_ID` | yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | yes | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | yes | OAuth callback URL |
| `ALLOWED_PHONES` | yes | Comma-separated E.164 allowlist; strictly enforced for SMS, onboarding, and API |
| `AUTH_SECRET` | yes | Session/signing secret for web dashboard |
| `APP_URL` | yes | Public worker URL |
| `WEB_URL` | yes | Dashboard URL for OAuth redirects |

D1 binding `DB` is configured in `wrangler.toml`.
