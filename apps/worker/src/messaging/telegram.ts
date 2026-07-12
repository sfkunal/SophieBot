import type { Env } from "../env.js";

export interface TelegramInbound {
  chatId: string;
  userId: string;
  username: string | null;
  body: string;
  messageId: number;
}

interface TelegramUpdate {
  message?: {
    message_id: number;
    text?: string;
    chat?: { id: number; type: string };
    from?: { id: number; username?: string };
  };
}

export function parseTelegramUpdate(raw: unknown): TelegramInbound | null {
  const update = raw as TelegramUpdate;
  const message = update.message;
  if (!message?.text?.trim() || !message.chat?.id || !message.from?.id) {
    return null;
  }

  return {
    chatId: String(message.chat.id),
    userId: String(message.from.id),
    username: message.from.username ?? null,
    body: message.text.trim(),
    messageId: message.message_id,
  };
}

export function verifyTelegramWebhook(
  request: Request,
  secret: string | undefined,
): boolean {
  if (!secret?.trim()) return true;
  const header = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  return header === secret;
}

export async function sendTelegramMessage(
  env: Env,
  chatId: string,
  text: string,
): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram send failed (${res.status}): ${body}`);
  }
}

export async function getTelegramBotUsername(env: Env): Promise<string | null> {
  if (env.TELEGRAM_BOT_USERNAME?.trim()) {
    return env.TELEGRAM_BOT_USERNAME.trim().replace(/^@/, "");
  }

  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return null;

  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    ok?: boolean;
    result?: { username?: string };
  };

  return data.ok ? (data.result?.username ?? null) : null;
}
