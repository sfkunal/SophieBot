import { hmacSign, hmacVerify } from "./crypto.js";

const STATE_TTL_MS = 10 * 60_000;

export async function createOAuthState(
  userId: string,
  secret: string,
): Promise<string> {
  const payload = btoa(JSON.stringify({ userId, ts: Date.now() }));
  const sig = await hmacSign(payload, secret);
  return `${payload}.${sig}`;
}

export async function verifyOAuthState(
  state: string,
  secret: string,
): Promise<{ userId: string } | null> {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;

  const valid = await hmacVerify(payload, sig, secret);
  if (!valid) return null;

  try {
    const parsed = JSON.parse(atob(payload)) as { userId: string; ts: number };
    if (!parsed.userId || !parsed.ts) return null;
    if (Date.now() - parsed.ts > STATE_TTL_MS) return null;
    return { userId: parsed.userId };
  } catch {
    return null;
  }
}
