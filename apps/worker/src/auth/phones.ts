import type { Env } from "../env.js";

function parseAllowedPhones(raw: string): Set<string> {
  return new Set(
    raw
      .split(/[,\s]+/)
      .map((p) => normalizePhone(p.trim()))
      .filter(Boolean),
  );
}

export function isPhoneInAllowlist(env: Env, phone: string): boolean {
  if (!env.ALLOWED_PHONES?.trim()) return false;
  return parseAllowedPhones(env.ALLOWED_PHONES).has(normalizePhone(phone));
}

export async function isPhoneAuthorized(
  env: Env,
  phone: string,
): Promise<boolean> {
  if (isPhoneInAllowlist(env, phone)) return true;

  const user = await env.DB.prepare(
    "SELECT id FROM users WHERE phone_e164 = ?",
  )
    .bind(phone)
    .first<{ id: string }>();

  return !!user;
}

export function generateVerificationCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}
