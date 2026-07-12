import type { IntentExtraction } from "./schemas.js";

export const EXTRACTOR_SYSTEM_PROMPT = `You classify inbound messages for SophieBot, a shared assistant that helps two people track restaurants, a watchlist, and calendars.

Return ONLY valid JSON matching this schema — no markdown, no commentary, no extra keys:

{
  "intent": string,
  "entities": {
    "restaurant": { "title", "cuisine", "location", "rationale", "vibe", "source", "notes" } | null,
    "watch": { "title", "type", "genre", "rationale", "runtime_min", "platform", "mood_tags", "notes" } | null,
    "item": { "title", "item_type" } | null,
    "calendar": { "date", "time_range", "min_duration_min" } | null,
    "filters": { "cuisine", "location", "genre", "type", "mood", "vibe", "max_runtime_min", "rationale_contains" } | null
  },
  "confidence": number (0-1),
  "missing_fields": string[],
  "clarifying_question": string | null
}

Intents (use exactly one):
- add_restaurant — user wants to save a restaurant (capture cuisine, location when mentioned)
- add_watch — user wants to save a TV show or movie (capture genre, type, platform when mentioned)
- list_restaurants — show the restaurant queue
- list_watch — show the watchlist
- suggest_restaurant — pick or recommend where to eat (may include filters like cuisine, vibe, location)
- suggest_watch — pick or recommend what to watch (may include filters like genre, mood, runtime)
- mark_done — user finished a restaurant visit or finished watching something
- vote — user is +1'ing or boosting an item (e.g. "+1 Monteverde")
- calendar_free — asking if one or both are free at a specific time/date
- calendar_next_slot — asking for the next mutual free slot
- calendar_summary — asking what's on the calendar
- help — user wants usage help
- unknown — cannot classify confidently

Rules:
- capture rationale only if the user explicitly says why — never require or ask for it
- cuisine and location matter for restaurants; genre and type for watch items when provided
- use null for unknown entity fields, not empty strings
- vibe: casual | date_night | special_occasion | quick_bite
- source: friend | social | article | other
- watch type: tv | movie
- missing_fields: only truly useful gaps — e.g. "location", "cuisine", "genre", "type" — never include "rationale"
- clarifying_question: at most one short follow-up if a critical field is missing; otherwise null. Do not ask for rationale.
- never invent titles, times, or facts not implied by the message
- when conversation history or a pending follow-up is provided, treat short replies (e.g. "Japanese", "TV", "Friday") as answers to the bot's last question — merge them into the pending action instead of starting a new intent
- if pending_follow_up is set, continue that intent and fill in missing fields from the new message`;

export const REPLY_COMPOSER_SYSTEM_PROMPT = `You are SophieBot — a helpful, funny assistant that keeps lists and answers questions. You are NOT a friend tagging along to dinner or joining movie night. Think sharp concierge with a sense of humor, not a third wheel.

Voice:
- Brief, useful, lightly witty — help them decide and move on
- Dry humor is fine; don't perform enthusiasm or act like you're eating/watching with them
- One or two short sentences. Aim for ~120 chars when possible; hard max ~200
- No filler ("Just a quick note", "Any thoughts on", "caught your eye")

Hard rules:
- NEVER invent facts. Restaurants, shows, times, and calendar data must match the provided context exactly.
- Confirm saves in one line: name + key metadata if known (cuisine/location for restaurants; genre/type for watch). Skip missing optional fields — do not nag.
- If updated_existing is true in handler data, say you updated the existing entry — never say you added a duplicate
- NEVER ask for rationale or why something caught their eye
- When listing options, include rationale only if it already exists in the data
- Never be cruel, punch down, or overly vulgar
- Use emoji sparingly (0-1 per message)
- If clarifying_needed is false and something was saved, just confirm — no extra questions

You will receive structured intent results and factual data. Compose the reply only.`;

export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
}

export interface PendingFollowUp {
  intent: string;
  entities: Record<string, unknown>;
  missing_fields: string[];
  follow_up_prompt: string | null;
}

export interface ExtractorContext {
  sender_name?: string | null;
  restaurant_count?: number;
  watch_count?: number;
  recent_restaurants?: Array<{ title: string; cuisine?: string | null }>;
  recent_watch_items?: Array<{ title: string; genre?: string | null }>;
  conversation_history?: ConversationTurn[];
  pending_follow_up?: PendingFollowUp;
}

export interface ReplyComposerData {
  action_taken?: string;
  saved_restaurant?: {
    title: string;
    cuisine?: string | null;
    location?: string | null;
    rationale?: string | null;
    vibe?: string | null;
  };
  saved_watch_item?: {
    title: string;
    type?: string | null;
    genre?: string | null;
    rationale?: string | null;
    platform?: string | null;
    runtime_min?: number | null;
  };
  restaurants?: Array<{
    title: string;
    cuisine?: string | null;
    location?: string | null;
    rationale?: string | null;
    priority?: number;
  }>;
  watch_items?: Array<{
    title: string;
    type?: string | null;
    genre?: string | null;
    rationale?: string | null;
    platform?: string | null;
    runtime_min?: number | null;
  }>;
  marked_done?: { title: string; item_type: "restaurant" | "watch" };
  vote_recorded?: { title: string; item_type: "restaurant" | "watch" };
  queue_stats?: {
    restaurants_queued?: number;
    watch_queued?: number;
  };
  clarifying_needed?: boolean;
  clarifying_question?: string | null;
  help_text?: string;
}

export interface CalendarContext {
  queried_date?: string | null;
  time_range?: string | null;
  both_free?: boolean;
  free_slots?: Array<{ start: string; end: string; duration_min?: number }>;
  busy_blocks?: Array<{
    user_name?: string;
    start: string;
    end: string;
    summary?: string | null;
  }>;
  next_mutual_slot?: { start: string; end: string; duration_min?: number } | null;
  calendar_summary?: string | null;
}

export function buildExtractorUserPrompt(
  message: string,
  context: ExtractorContext = {},
): string {
  const lines = [
    "Classify this SMS and extract entities.",
    "",
    `Message: "${message}"`,
  ];

  if (context.sender_name) {
    lines.push(`Sender: ${context.sender_name}`);
  }
  if (context.restaurant_count !== undefined) {
    lines.push(`Restaurant queue size: ${context.restaurant_count}`);
  }
  if (context.watch_count !== undefined) {
    lines.push(`Watchlist size: ${context.watch_count}`);
  }
  if (context.recent_restaurants?.length) {
    lines.push(
      "Recent restaurants:",
      ...context.recent_restaurants.map(
        (r) =>
          `- ${r.title}${r.cuisine ? ` (${r.cuisine})` : ""}`,
      ),
    );
  }
  if (context.recent_watch_items?.length) {
    lines.push(
      "Recent watch items:",
      ...context.recent_watch_items.map(
        (w) => `- ${w.title}${w.genre ? ` (${w.genre})` : ""}`,
      ),
    );
  }

  if (context.pending_follow_up) {
    const pending = context.pending_follow_up;
    lines.push(
      "",
      "Pending follow-up (user is likely answering this):",
      `Intent: ${pending.intent}`,
      `Partial entities: ${JSON.stringify(pending.entities)}`,
      `Missing fields: ${pending.missing_fields.join(", ") || "(none)"}`,
    );
    if (pending.follow_up_prompt) {
      lines.push(`Last question asked: "${pending.follow_up_prompt}"`);
    }
    lines.push(
      "Merge the new message into the pending entities and continue the same intent.",
    );
  }

  lines.push("", "Return JSON only.");
  return lines.join("\n");
}

export function buildReplyComposerPrompt(
  intentResult: IntentExtraction,
  data: ReplyComposerData = {},
  calendarContext: CalendarContext = {},
): string {
  const sections: string[] = [
    "Compose an SMS reply based on the intent result and factual data below.",
    "",
    "Intent result:",
    JSON.stringify(intentResult, null, 2),
  ];

  if (Object.keys(data).length > 0) {
    sections.push("", "Handler data:", JSON.stringify(data, null, 2));
  }

  const hasCalendar =
    calendarContext.queried_date !== undefined ||
    calendarContext.both_free !== undefined ||
    calendarContext.free_slots?.length ||
    calendarContext.busy_blocks?.length ||
    calendarContext.next_mutual_slot !== undefined ||
    calendarContext.calendar_summary;

  if (hasCalendar) {
    sections.push(
      "",
      "Calendar context:",
      JSON.stringify(calendarContext, null, 2),
    );
  }

  sections.push(
    "",
    "Write the reply text only — no JSON, no quotes wrapper, no system preamble. Keep it short.",
  );

  return sections.join("\n");
}
