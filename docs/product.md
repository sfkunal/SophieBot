# SophieBot — Product Specification

SophieBot is a shared SMS and Telegram assistant for a couple. One bot, two allowlisted phones, one restaurant queue, one watchlist, and Google Calendar awareness — with a warm, funny personality that feels like texting a mutual friend, not a bot.

## Problem

Couples accumulate restaurant recommendations and "we should watch that" ideas across texts, notes, and memory. Deciding what to do tonight means digging through old messages, guessing why something was saved, and manually comparing calendars. SophieBot turns that friction into a single messaging thread plus a lightweight web dashboard.

## Users

- **Primary:** Two people in a relationship who share meals, media, and schedules.
- **Access model:** Exactly two phone numbers on an allowlist. No public signup, no multi-tenant SaaS.

## Core Value Propositions

1. **Capture by text** — Save a restaurant or show in one message; SophieBot extracts metadata and confirms.
2. **Decide with context** — Lists and suggestions include *why* something is on the list (rationale), not just titles.
3. **Coordinate schedules** — Google Calendar integration answers "are we free?" and "what's next?" without opening another app.
4. **Personality that sticks** — Replies are short, witty, and emotionally literate; she celebrates wins and gently roasts endless queues.

## Channels

### SMS (primary)

Inbound texts hit a Cloudflare Worker webhook (Twilio). Outbound replies are composed by OpenAI using handler data — the model never invents restaurants, shows, or calendar facts.

### Telegram (alternate)

Same pipeline as SMS. Used for day-to-day messaging and as a phone-verification fallback when Twilio SMS isn't available. Only linked, allowlisted users can interact — unlinked users get a static message with no OpenAI usage.

**Example flows (SMS or Telegram):**

| User says | SophieBot does |
|-----------|----------------|
| "Save Monteverde — Italian in West Loop, Sarah said best cacio e pepe" | `add_restaurant` with cuisine, location, rationale, source |
| "Add Severance — sci-fi workplace dread, Apple TV" | `add_watch` with genre, type, platform, rationale |
| "What should we watch tonight? something under 90 min" | `suggest_watch` with runtime filter |
| "Are we free Friday at 7?" | `calendar_free` |
| "When's our next mutual evening free?" | `calendar_next_slot` |
| "+1 Monteverde" | `vote` — boosts priority |
| "We went to Monteverde!" | `mark_done` |

### Web dashboard (secondary)

Static site on GitHub Pages:

- **Setup** — Phone verification (SMS code or Telegram `/verify`), Google Calendar OAuth per user.
- **Dashboard** — Browse restaurant queue, watchlist, and upcoming free slots; mark items done.

## Data Model

### Restaurants

| Field | Purpose |
|-------|---------|
| `title` | Name |
| `cuisine` | e.g. Italian, Thai |
| `location` | Neighborhood, city, or address hint |
| `rationale` | **First-class** — why it's on the list |
| `vibe` | `casual` \| `date_night` \| `special_occasion` \| `quick_bite` |
| `source` | `friend` \| `social` \| `article` \| `other` |
| `notes` | Freeform |
| `priority` | Vote-weighted queue ordering |
| `status` | `queued` \| `done` \| `dropped` |

### Watch items

| Field | Purpose |
|-------|---------|
| `title` | Show or movie name |
| `type` | `tv` \| `movie` |
| `genre` | e.g. sci-fi, comedy |
| `rationale` | **First-class** — mood, hook, who recommended it |
| `runtime_min` | For "something short tonight" |
| `platform` | Netflix, Apple TV, etc. |
| `mood_tags` | e.g. "sad but good", "comfort rewatch" |
| `priority` / `status` | Same pattern as restaurants |

### Calendar

- Per-user Google OAuth refresh tokens stored in D1.
- Busy blocks cached with TTL; mutual free slots computed in the worker.
- Intents: `calendar_free`, `calendar_next_slot`, `calendar_summary`.

## Intent Taxonomy

All inbound messages are classified into exactly one intent (see `packages/shared/src/prompts.ts`):

| Intent | Description |
|--------|-------------|
| `add_restaurant` | Save a restaurant |
| `add_watch` | Save a show or movie |
| `list_restaurants` | Show restaurant queue |
| `list_watch` | Show watchlist |
| `suggest_restaurant` | Recommend where to eat (optional filters) |
| `suggest_watch` | Recommend what to watch (optional filters) |
| `mark_done` | Finished a visit or watch |
| `vote` | +1 / boost an item |
| `calendar_free` | Free/busy at a specific time |
| `calendar_next_slot` | Next mutual availability |
| `calendar_summary` | What's on the calendar |
| `help` | Usage help |
| `unknown` | Low confidence — ask one clarifying question |

Extraction returns JSON: `intent`, `entities`, `confidence`, `missing_fields`, optional `clarifying_question`.

## Personality Guidelines

SophieBot texts like a warm, funny mutual friend:

- **Tone:** Witty, lightly teasing about indecision and list hoarding; celebrates actually doing things.
- **Length:** ~320 characters when possible; max two SMS chunks.
- **Emoji:** 0–2 per message (🍽 🎬 ✅).
- **Hard rules:** Never invent facts; always confirm saves with name + key metadata; include rationale snippets in lists; one casual follow-up when data is missing — not an interrogation.
- **Emotional literacy:** Distinguish "sad but good" from "sad and devastating" for media picks.

## Automation

- **Weekly digest cron** (Friday 6pm UTC): Nudges about restaurants and watch items queued 30+ days with no action.
- **Phone verification:** 6-digit SMS codes or Telegram `/verify` for dashboard setup; only `ALLOWED_PHONES` may register.

## Security & Privacy

- Allowlist enforced on SMS, Telegram, and API.
- `AUTH_SECRET` signs dashboard sessions.
- Google refresh tokens stored in D1 (operator responsibility for secret rotation).
- OpenAI receives message text and structured context only — no full calendar dump unless needed for the request.

## Success Metrics (informal)

- Items captured per week.
- Ratio of `mark_done` to `add_*` (are lists turning into action?).
- Calendar queries per week (is coordination working?).
- Time from first setup to both users connected.

## Non-Goals (v1)

- Group chats or more than two users.
- Public restaurant/watch discovery or social features.
- Native mobile apps.
- Payments or reservations integrations.

## Future Ideas

- Shared "tonight mode" that picks one restaurant and one show with one tap.
- Location-aware restaurant suggestions.
- Integration with Letterboxd / Beli / etc.
- Voice memo → transcript → save.
