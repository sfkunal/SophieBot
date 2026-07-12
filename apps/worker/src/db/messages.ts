import type { ExtractedIntent, MessageChannel } from "@brain/shared";
import { newId, nowIso } from "../utils/id.js";

export async function logInboundMessage(
  db: D1Database,
  senderId: string,
  body: string,
  intent: ExtractedIntent | null,
  replyBody: string | null,
  channel: MessageChannel = "sms",
): Promise<string> {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO inbound_messages (id, from_phone, channel, body, parsed_intent_json, reply_body, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      senderId,
      channel,
      body,
      intent ? JSON.stringify(intent) : null,
      replyBody,
      nowIso(),
    )
    .run();
  return id;
}
