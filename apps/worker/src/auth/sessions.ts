import { hmacSign, hmacVerify, timingSafeEqual } from "./crypto.js";

export interface SessionPayload {
  userId: string;
  phone: string;
  exp: number;
}

export async function createSessionToken(
  userId: string,
  phone: string,
  secret: string,
  ttlDays = 30,
): Promise<string> {
  const payload: SessionPayload = {
    userId,
    phone,
    exp: Date.now() + ttlDays * 24 * 60 * 60 * 1000,
  };
  const encoded = btoa(JSON.stringify(payload));
  const sig = await hmacSign(encoded, secret);
  return `${encoded}.${sig}`;
}

export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<SessionPayload | null> {
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;

  const valid = await hmacVerify(encoded, sig, secret);
  if (!valid) return null;

  try {
    const payload = JSON.parse(atob(encoded)) as SessionPayload;
    if (!payload.userId || !payload.phone || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function maskPhone(phone: string): string {
  if (phone.length < 8) return phone;
  return `${phone.slice(0, 5)}***${phone.slice(-4)}`;
}

export { timingSafeEqual };
