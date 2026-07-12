# @brain/worker

Cloudflare Worker backend for Brain — SMS assistant for shared restaurant lists, watchlists, and calendar coordination.

## Prerequisites

- Node.js 20+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm i -g wrangler` or use the local devDependency)
- Cloudflare account with Workers + D1 enabled
- Twilio account with an SMS-capable phone number
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
```

Update `[vars]` in `wrangler.toml`:

- `APP_URL` — your worker URL (e.g. `https://brain-worker.your-subdomain.workers.dev`)
- `WEB_URL` — dashboard URL for OAuth redirects
- `GOOGLE_REDIRECT_URI` — `{APP_URL}/api/auth/google/callback`

For local dev, create `.dev.vars` in `apps/worker/` (gitignored) with the same keys.

### 5. Twilio webhook

Point your Twilio number's **Messaging webhook** to:

```
POST https://<your-worker>/webhooks/twilio
```

Content-Type: `application/x-www-form-urlencoded`

### 6. Google OAuth

In Google Cloud Console, add authorized redirect URI:

```
https://<your-worker>/api/auth/google/callback
```

## Development

```bash
npm run dev
# or from repo root:
npm run dev:worker
```

Health check: `GET http://localhost:8787/health`

## Deploy

```bash
npm run deploy
```

## API routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/webhooks/twilio` | Inbound SMS pipeline |
| GET | `/api/auth/google/start?phone=+1...` | Start Google OAuth |
| GET | `/api/auth/google/callback` | OAuth callback |
| POST | `/api/onboard/verify` | Send phone verification SMS |
| POST | `/api/onboard/confirm` | Confirm code + register user |
| GET | `/api/restaurants` | List restaurants (`?status=queued`) |
| GET | `/api/watch` | List watch items |
| GET | `/api/calendar/slots` | Mutual free slots this week |
| GET | `/health` | Health check |

## SMS pipeline

1. Verify Twilio signature
2. Check phone allowlist (`ALLOWED_PHONES`) or registered user
3. Load DB context (queue counts, recent items)
4. OpenAI intent extraction (`gpt-4o-mini`)
5. Deterministic handler by intent
6. OpenAI reply composition (warm/funny personality)
7. Send SMS + log to `inbound_messages`

## Cron

Friday 6pm UTC (`0 18 * * 5`) — weekly digest nudging stale queued items (30+ days).

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | yes | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | yes | Twilio auth token (webhook signing + API) |
| `TWILIO_PHONE_NUMBER` | yes | Outbound SMS from number (E.164) |
| `OPENAI_API_KEY` | yes | OpenAI API key |
| `GOOGLE_CLIENT_ID` | yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | yes | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | yes | OAuth callback URL |
| `ALLOWED_PHONES` | yes | Comma-separated E.164 allowlist |
| `AUTH_SECRET` | yes | Session/signing secret for web dashboard |
| `APP_URL` | yes | Public worker URL |
| `WEB_URL` | yes | Dashboard URL for OAuth redirects |

D1 binding `DB` is configured in `wrangler.toml`.
