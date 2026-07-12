import type { ExtractedIntent, Intent, MessageChannel } from "@brain/shared";
import { nowIso } from "../utils/id.js";

export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
}

export interface PendingFollowUp {
  intent: Intent;
  entities: Record<string, unknown>;
  missing_fields: string[];
  follow_up_prompt: string | null;
}

export interface RecentSavedItem {
  item_type: "restaurant" | "watch";
  item_id: string;
  title: string;
}

export function recentSavedKey(senderKey: string): string {
  return `${senderKey}::recent`;
}

export function conversationSenderKey(
  channel: MessageChannel,
  senderId: string,
): string {
  return `${channel}:${senderId}`;
}

export async function getRecentConversation(
  db: D1Database,
  senderId: string,
  channel: MessageChannel,
  limit = 4,
): Promise<ConversationTurn[]> {
  const { results } = await db
    .prepare(
      `SELECT body, reply_body
       FROM inbound_messages
       WHERE from_phone = ? AND channel = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(senderId, channel, limit)
    .all<{ body: string; reply_body: string | null }>();

  const rows = [...(results ?? [])].reverse();
  const turns: ConversationTurn[] = [];

  for (const row of rows) {
    turns.push({ role: "user", text: row.body });
    if (row.reply_body?.trim()) {
      turns.push({ role: "assistant", text: row.reply_body });
    }
  }

  return turns;
}

export async function getConversationState(
  db: D1Database,
  senderKey: string,
): Promise<PendingFollowUp | null> {
  const row = await db
    .prepare(
      `SELECT pending_intent, pending_entities_json, missing_fields_json, follow_up_prompt, expires_at
       FROM conversation_state
       WHERE sender_key = ?`,
    )
    .bind(senderKey)
    .first<{
      pending_intent: Intent;
      pending_entities_json: string;
      missing_fields_json: string;
      follow_up_prompt: string | null;
      expires_at: string;
    }>();

  if (!row || new Date(row.expires_at) < new Date()) {
    if (row) {
      await clearConversationState(db, senderKey);
    }
    return null;
  }

  return {
    intent: row.pending_intent,
    entities: JSON.parse(row.pending_entities_json) as Record<string, unknown>,
    missing_fields: JSON.parse(row.missing_fields_json) as string[],
    follow_up_prompt: row.follow_up_prompt,
  };
}

export async function setConversationState(
  db: D1Database,
  senderKey: string,
  channel: MessageChannel,
  pending: PendingFollowUp,
  ttlMinutes = 30,
): Promise<void> {
  const expires = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  await db
    .prepare(
      `INSERT INTO conversation_state (
         sender_key, channel, pending_intent, pending_entities_json,
         missing_fields_json, follow_up_prompt, created_at, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(sender_key) DO UPDATE SET
         channel = excluded.channel,
         pending_intent = excluded.pending_intent,
         pending_entities_json = excluded.pending_entities_json,
         missing_fields_json = excluded.missing_fields_json,
         follow_up_prompt = excluded.follow_up_prompt,
         created_at = excluded.created_at,
         expires_at = excluded.expires_at`,
    )
    .bind(
      senderKey,
      channel,
      pending.intent,
      JSON.stringify(pending.entities),
      JSON.stringify(pending.missing_fields),
      pending.follow_up_prompt,
      nowIso(),
      expires,
    )
    .run();
}

export async function clearConversationState(
  db: D1Database,
  senderKey: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM conversation_state WHERE sender_key = ?")
    .bind(senderKey)
    .run();
}

export function buildPendingFollowUp(
  intent: ExtractedIntent,
  handlerData: Record<string, unknown>,
  followUpQuestion?: string,
): PendingFollowUp | null {
  const pendingRestaurant = handlerData.pending_restaurant as
    | Record<string, unknown>
    | undefined;
  const pendingWatch = handlerData.pending_watch as
    | Record<string, unknown>
    | undefined;

  if (pendingRestaurant) {
    return {
      intent: "add_restaurant",
      entities: { restaurant: pendingRestaurant },
      missing_fields: intent.missing_fields,
      follow_up_prompt: followUpQuestion ?? null,
    };
  }

  if (pendingWatch) {
    return {
      intent: "add_watch",
      entities: { watch: pendingWatch },
      missing_fields: intent.missing_fields,
      follow_up_prompt: followUpQuestion ?? null,
    };
  }

  if (followUpQuestion) {
    return {
      intent: intent.intent,
      entities: intent.entities,
      missing_fields: intent.missing_fields,
      follow_up_prompt: followUpQuestion,
    };
  }

  return null;
}

export function isFollowUpCompleted(
  handlerData: Record<string, unknown>,
): boolean {
  return !!(
    handlerData.saved_restaurant ||
    handlerData.saved_watch_item ||
    handlerData.marked_done ||
    handlerData.vote_recorded
  );
}

export async function setRecentSavedItem(
  db: D1Database,
  senderKey: string,
  channel: MessageChannel,
  saved: RecentSavedItem,
  ttlMinutes = 30,
): Promise<void> {
  await setConversationState(
    db,
    recentSavedKey(senderKey),
    channel,
    {
      intent: saved.item_type === "watch" ? "add_watch" : "add_restaurant",
      entities: { _saved: saved },
      missing_fields: [],
      follow_up_prompt: null,
    },
    ttlMinutes,
  );
}

export async function getRecentSavedItem(
  db: D1Database,
  senderKey: string,
): Promise<RecentSavedItem | null> {
  const state = await getConversationState(db, recentSavedKey(senderKey));
  const saved = state?.entities._saved as RecentSavedItem | undefined;
  if (!saved?.item_id || !saved.title || !saved.item_type) return null;
  return saved;
}

export async function clearRecentSavedItem(
  db: D1Database,
  senderKey: string,
): Promise<void> {
  await clearConversationState(db, recentSavedKey(senderKey));
}
