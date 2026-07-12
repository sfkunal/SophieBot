import type { Env } from "../env.js";
import { isTelegramConfigured } from "../env.js";
import { sendSms } from "../sms/twilio.js";
import type { OutboundTarget } from "./types.js";
import { sendTelegramMessage } from "./telegram.js";

export async function sendOutboundMessage(
  env: Env,
  target: OutboundTarget,
  body: string,
): Promise<void> {
  if (target.channel === "telegram") {
    if (!isTelegramConfigured(env)) {
      throw new Error("Telegram is not configured");
    }
    await sendTelegramMessage(env, target.recipientId, body);
    return;
  }

  await sendSms(env, target.recipientId, body);
}

export function preferredOutboundTarget(user: {
  phone_e164: string;
  telegram_chat_id?: string | null;
}): OutboundTarget {
  if (user.telegram_chat_id) {
    return { channel: "telegram", recipientId: user.telegram_chat_id };
  }
  return { channel: "sms", recipientId: user.phone_e164 };
}
