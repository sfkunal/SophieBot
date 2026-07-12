import type { Env } from "../env.js";

export interface TwilioInbound {
  from: string;
  to: string;
  body: string;
  messageSid: string;
}

/** Parse application/x-www-form-urlencoded Twilio webhook body. */
export function parseTwilioForm(body: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const pair of body.split("&")) {
    const [key, val] = pair.split("=");
    if (key) {
      params[decodeURIComponent(key)] = decodeURIComponent(val ?? "");
    }
  }
  return params;
}

export function parseTwilioInbound(params: Record<string, string>): TwilioInbound {
  return {
    from: params.From ?? "",
    to: params.To ?? "",
    body: (params.Body ?? "").trim(),
    messageSid: params.MessageSid ?? "",
  };
}

export function resolveTwilioWebhookUrl(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("X-Forwarded-Host");

  // ngrok / reverse proxies forward the public host Twilio signed against.
  if (forwardedHost) {
    const proto = request.headers.get("X-Forwarded-Proto") ?? "https";
    return `${proto}://${forwardedHost}${url.pathname}${url.search}`;
  }

  return url.toString();
}

/** Verify X-Twilio-Signature per Twilio docs. */
export async function verifyTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): Promise<boolean> {
  if (!signature || !authToken) return false;

  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(data),
  );

  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function sendSms(
  env: Env,
  to: string,
  body: string,
): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const form = new URLSearchParams({
    To: to,
    From: env.TWILIO_PHONE_NUMBER,
    Body: body,
  });

  const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio send failed (${res.status}): ${text}`);
  }
}

export function twimlReply(message: string): string {
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}
