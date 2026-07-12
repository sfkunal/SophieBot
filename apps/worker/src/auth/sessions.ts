export interface SessionPayload {
  userId: string;
  phone: string;
  exp: number;
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function hmacVerify(
  data: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const expected = await hmacSign(data, secret);
  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
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
