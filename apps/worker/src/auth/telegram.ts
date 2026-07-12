import type { Env } from "../env.js";

export async function isTelegramLinked(
  env: Env,
  chatId: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT id FROM users WHERE telegram_chat_id = ?",
  )
    .bind(chatId)
    .first<{ id: string }>();

  return !!row;
}
