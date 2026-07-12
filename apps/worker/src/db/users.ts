import type { User } from "@brain/shared";
import type { Env } from "../env.js";
import { newId, nowIso } from "../utils/id.js";

export async function getUserByPhone(
  db: D1Database,
  phone: string,
): Promise<User | null> {
  return db
    .prepare("SELECT * FROM users WHERE phone_e164 = ?")
    .bind(phone)
    .first<User>();
}

export async function getUserByTelegramChatId(
  db: D1Database,
  chatId: string,
): Promise<User | null> {
  return db
    .prepare("SELECT * FROM users WHERE telegram_chat_id = ?")
    .bind(chatId)
    .first<User>();
}

export async function getUserById(
  db: D1Database,
  id: string,
): Promise<User | null> {
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<User>();
}

export async function listUsers(db: D1Database): Promise<User[]> {
  const { results } = await db
    .prepare("SELECT * FROM users ORDER BY created_at ASC")
    .all<User>();
  return results ?? [];
}

export async function createUser(
  db: D1Database,
  phone: string,
  name?: string | null,
): Promise<User> {
  const user: User = {
    id: newId(),
    phone_e164: phone,
    name: name ?? null,
    google_refresh_token: null,
    prefs_json: null,
    telegram_chat_id: null,
    telegram_user_id: null,
    created_at: nowIso(),
  };
  await db
    .prepare(
      `INSERT INTO users (id, phone_e164, name, google_refresh_token, prefs_json, telegram_chat_id, telegram_user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      user.id,
      user.phone_e164,
      user.name,
      user.google_refresh_token,
      user.prefs_json,
      user.telegram_chat_id,
      user.telegram_user_id,
      user.created_at,
    )
    .run();
  return user;
}

export async function updateGoogleRefreshToken(
  db: D1Database,
  userId: string,
  token: string,
): Promise<void> {
  await db
    .prepare("UPDATE users SET google_refresh_token = ? WHERE id = ?")
    .bind(token, userId)
    .run();
}

export async function storeVerificationCode(
  env: Env,
  phone: string,
  code: string,
  ttlMinutes = 10,
): Promise<void> {
  const expires = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  await env.DB.prepare(
    `INSERT INTO phone_verification_codes (phone_e164, code, expires_at, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(phone_e164) DO UPDATE SET code = ?, expires_at = ?, created_at = ?`,
  )
    .bind(phone, code, expires, nowIso(), code, expires, nowIso())
    .run();
}

export async function verifyCode(
  env: Env,
  phone: string,
  code: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT code, expires_at FROM phone_verification_codes WHERE phone_e164 = ?",
  )
    .bind(phone)
    .first<{ code: string; expires_at: string }>();

  if (!row) return false;
  if (row.code !== code) return false;
  if (new Date(row.expires_at) < new Date()) return false;

  await env.DB.prepare(
    "DELETE FROM phone_verification_codes WHERE phone_e164 = ?",
  )
    .bind(phone)
    .run();

  return true;
}

function generateTelegramLinkCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function storeTelegramLinkCode(
  env: Env,
  userId: string,
  ttlMinutes = 15,
): Promise<string> {
  const code = generateTelegramLinkCode();
  const expires = new Date(Date.now() + ttlMinutes * 60_000).toISOString();

  await env.DB.prepare("DELETE FROM telegram_link_codes WHERE user_id = ?")
    .bind(userId)
    .run();

  await env.DB.prepare(
    `INSERT INTO telegram_link_codes (code, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(code, userId, expires, nowIso())
    .run();

  return code;
}

export async function claimTelegramLinkCode(
  env: Env,
  code: string,
  chatId: string,
  telegramUserId: string,
): Promise<User | null> {
  const normalized = code.trim().toUpperCase();
  const row = await env.DB.prepare(
    "SELECT user_id, expires_at FROM telegram_link_codes WHERE code = ?",
  )
    .bind(normalized)
    .first<{ user_id: string; expires_at: string }>();

  if (!row || new Date(row.expires_at) < new Date()) {
    return null;
  }

  const existingChat = await env.DB.prepare(
    "SELECT id FROM users WHERE telegram_chat_id = ? AND id != ?",
  )
    .bind(chatId, row.user_id)
    .first<{ id: string }>();

  if (existingChat) {
    return null;
  }

  await env.DB.prepare(
    "UPDATE users SET telegram_chat_id = ?, telegram_user_id = ? WHERE id = ?",
  )
    .bind(chatId, telegramUserId, row.user_id)
    .run();

  await env.DB.prepare("DELETE FROM telegram_link_codes WHERE code = ?")
    .bind(normalized)
    .run();

  return getUserById(env.DB, row.user_id);
}
