import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  deleteItemRequestSchema,
  markDoneRequestSchema,
  phoneVerifyConfirmSchema,
  phoneVerifyRequestSchema,
} from "@brain/shared";
import type { Env } from "./env.js";
import { isTelegramConfigured } from "./env.js";
import { requireAuth } from "./auth/middleware.js";
import {
  generateVerificationCode,
  isPhoneInAllowlist,
  normalizePhone,
} from "./auth/phones.js";
import {
  createSessionToken,
  maskPhone,
  type SessionPayload,
} from "./auth/sessions.js";
import {
  createUser,
  getUserByPhone,
  listUsers,
  storeVerificationCode,
  storeTelegramLinkCode,
  updateGoogleRefreshToken,
  verifyCode,
} from "./db/users.js";
import { listRestaurants, markRestaurantDone, dropRestaurant } from "./db/restaurants.js";
import { listWatchItems, markWatchDone, dropWatchItem } from "./db/watch.js";
import {
  exchangeCodeForTokens,
  fetchAllUsersBusyBlocks,
  findFreeSlots,
  getOAuthUrl,
  weekBounds,
} from "./calendar/google.js";
import { handleTwilioWebhook } from "./sms/pipeline.js";
import { handleTelegramWebhook } from "./messaging/pipeline.js";
import { getTelegramBotUsername } from "./messaging/telegram.js";
import { sendSms } from "./sms/twilio.js";
import { handleWeeklyDigest } from "./cron/weekly-digest.js";
import { buildWebReturnUrl } from "./utils/web-url.js";

type Variables = {
  session: SessionPayload;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const LOCAL_WEB_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

app.use(
  "/api/*",
  cors({
    origin: (origin, c) => {
      const allowed = new Set<string>([...LOCAL_WEB_ORIGINS]);
      try {
        allowed.add(new URL(c.env.WEB_URL).origin);
      } catch {
        // ignore invalid WEB_URL
      }
      if (!origin) return LOCAL_WEB_ORIGINS[0];
      return allowed.has(origin) ? origin : LOCAL_WEB_ORIGINS[0];
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

app.get("/health", (c) =>
  c.json({ ok: true, service: "brain-worker", ts: new Date().toISOString() }),
);

app.get("/", (c) =>
  c.json({
    service: "brain-worker",
    status: "ok",
    message:
      "This is the Brain API backend — not the web UI. Open the dashboard at WEB_URL (local dev: http://localhost:5173/SophieBot/).",
    endpoints: {
      health: "/health",
      twilio_webhook: "POST /webhooks/twilio",
      telegram_webhook: "POST /webhooks/telegram",
      onboard: "POST /api/onboard/verify, POST /api/onboard/confirm",
      dashboard_api: "/api/restaurants, /api/watch, /api/calendar/slots",
    },
    web_url: c.env.WEB_URL,
  }),
);

app.post("/webhooks/twilio", async (c) =>
  handleTwilioWebhook(c.req.raw, c.env),
);

app.post("/webhooks/telegram", async (c) => {
  if (!isTelegramConfigured(c.env)) {
    return c.json({ error: "Telegram not configured" }, 503);
  }
  return handleTelegramWebhook(c.req.raw, c.env);
});

app.get("/api/auth/google/start", async (c) => {
  const phone = c.req.query("phone");
  if (!phone) {
    return c.json({ error: "phone query param required" }, 400);
  }

  const normalized = normalizePhone(phone);
  const user = await getUserByPhone(c.env.DB, normalized);
  if (!user) {
    return c.json({ error: "user not found — onboard first" }, 404);
  }

  const state = btoa(JSON.stringify({ userId: user.id, ts: Date.now() }));
  return c.redirect(getOAuthUrl(c.env, state));
});

app.get("/api/auth/google/callback", async (c) => {
  const code = c.req.query("code");
  const stateRaw = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    return c.redirect(buildWebReturnUrl(c.env.WEB_URL, { calendar: "error" }));
  }

  if (!code || !stateRaw) {
    return c.json({ error: "missing code or state" }, 400);
  }

  let userId: string;
  try {
    const state = JSON.parse(atob(stateRaw)) as { userId: string; ts: number };
    if (Date.now() - state.ts > 10 * 60_000) {
      return c.json({ error: "state expired" }, 400);
    }
    userId = state.userId;
  } catch {
    return c.json({ error: "invalid state" }, 400);
  }

  try {
    const tokens = await exchangeCodeForTokens(c.env, code);
    if (tokens.refresh_token) {
      await updateGoogleRefreshToken(c.env.DB, userId, tokens.refresh_token);
    }
    return c.redirect(buildWebReturnUrl(c.env.WEB_URL, { calendar: "connected" }));
  } catch (err) {
    console.error("OAuth callback error:", err);
    return c.redirect(buildWebReturnUrl(c.env.WEB_URL, { calendar: "error" }));
  }
});

app.post("/api/onboard/verify", async (c) => {
  const parsed = phoneVerifyRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const phone = normalizePhone(parsed.data.phone);

  if (!isPhoneInAllowlist(c.env, phone)) {
    return c.json(
      { error: "Phone not on allowlist — ask your partner to add it." },
      403,
    );
  }

  const code = generateVerificationCode();
  await storeVerificationCode(c.env, phone, code);

  const isLocalDev = c.env.APP_URL.includes("localhost");

  try {
    await sendSms(
      c.env,
      phone,
      `Brain verification code: ${code} (expires in 10 min)`,
    );
  } catch (err) {
    console.error("Verification SMS failed:", err);
    if (!isLocalDev) {
      return c.json({ error: "Failed to send SMS" }, 500);
    }
  }

  if (isLocalDev) {
    console.log(`[dev] Verification code for ${phone}: ${code}`);
  }

  return c.json({
    ok: true,
    phone,
    ...(isLocalDev ? { dev_code: code } : {}),
  });
});

app.post("/api/onboard/confirm", async (c) => {
  const parsed = phoneVerifyConfirmSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const phone = normalizePhone(parsed.data.phone);
  const valid = await verifyCode(c.env, phone, parsed.data.code);

  if (!valid) {
    return c.json({ error: "Invalid or expired code" }, 401);
  }

  let user = await getUserByPhone(c.env.DB, phone);
  if (!user) {
    user = await createUser(c.env.DB, phone);
  }

  const token = await createSessionToken(
    user.id,
    user.phone_e164,
    c.env.AUTH_SECRET,
  );

  return c.json({
    ok: true,
    token,
    phone: user.phone_e164,
    user: { id: user.id, phone: user.phone_e164 },
  });
});

app.get("/api/onboard/status", requireAuth, async (c) => {
  const allowed = c.env.ALLOWED_PHONES.split(",")
    .map((p) => normalizePhone(p.trim()))
    .filter(Boolean);

  const registered = await listUsers(c.env.DB);
  const byPhone = new Map(registered.map((u) => [u.phone_e164, u]));

  const phones = [...new Set([...allowed, ...registered.map((u) => u.phone_e164)])];

  const users = phones.map((phone) => {
    const user = byPhone.get(phone);
    return {
      phone_masked: maskPhone(phone),
      verified: !!user,
      calendar_connected: !!user?.google_refresh_token,
      telegram_linked: !!user?.telegram_chat_id,
      name: user?.name ?? null,
    };
  });

  const ready =
    users.length >= 2 &&
    users.every((u) => u.verified && u.calendar_connected);

  return c.json({ users, ready });
});

app.post("/api/telegram/link-code", requireAuth, async (c) => {
  if (!isTelegramConfigured(c.env)) {
    return c.json({ error: "Telegram is not configured on this server" }, 503);
  }

  const code = await storeTelegramLinkCode(c.env, c.get("session").userId);
  const botUsername = await getTelegramBotUsername(c.env);

  return c.json({
    ok: true,
    code,
    expires_in_minutes: 15,
    bot_username: botUsername,
    instructions: botUsername
      ? `Open @${botUsername} in Telegram and send: /link ${code}`
      : `Send this to the SophieBot Telegram bot: /link ${code}`,
  });
});

app.post("/api/mark-done", requireAuth, async (c) => {
  const parsed = markDoneRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const { item_type, id } = parsed.data;

  if (item_type === "restaurant") {
    const item = await markRestaurantDone(c.env.DB, id);
    if (!item) return c.json({ error: "Restaurant not found" }, 404);
    return c.json({ ok: true, item });
  }

  const item = await markWatchDone(c.env.DB, id);
  if (!item) return c.json({ error: "Watch item not found" }, 404);
  return c.json({ ok: true, item });
});

app.post("/api/delete", requireAuth, async (c) => {
  const parsed = deleteItemRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const { item_type, id } = parsed.data;

  if (item_type === "restaurant") {
    const item = await dropRestaurant(c.env.DB, id);
    if (!item) return c.json({ error: "Restaurant not found" }, 404);
    return c.json({ ok: true, item });
  }

  const item = await dropWatchItem(c.env.DB, id);
  if (!item) return c.json({ error: "Watch item not found" }, 404);
  return c.json({ ok: true, item });
});

app.get("/api/restaurants", requireAuth, async (c) => {
  const status = c.req.query("status") as
    | "queued"
    | "done"
    | "dropped"
    | undefined;
  const restaurants = await listRestaurants(c.env.DB, status);
  return c.json({ restaurants });
});

app.get("/api/watch", requireAuth, async (c) => {
  const status = c.req.query("status") as
    | "queued"
    | "watching"
    | "done"
    | "dropped"
    | undefined;
  const items = await listWatchItems(c.env.DB, status);
  return c.json({ watch_items: items, watch: items });
});

app.get("/api/calendar/slots", requireAuth, async (c) => {
  const minDuration = parseInt(c.req.query("min_duration") ?? "60", 10);
  const forceRefresh = c.req.query("refresh") === "1";
  const { start, end } = weekBounds(new Date());

  const allBusy = await fetchAllUsersBusyBlocks(
    c.env,
    start,
    end,
    forceRefresh,
  );
  const perUserBlocks = allBusy.map((x) => x.blocks);
  const slots = findFreeSlots(start, end, perUserBlocks, minDuration);

  const events = allBusy.flatMap(({ user, blocks }) =>
    blocks.map((b) => ({
      user_name: user.name ?? user.phone_e164.slice(-4),
      start: b.start,
      end: b.end,
      summary: b.summary ?? "Busy",
    })),
  );

  return c.json({
    window: { start, end },
    free_slots: slots,
    slots,
    events,
    week_start: start,
    week_end: end,
    users_linked: allBusy.length,
  });
});

export default {
  fetch: app.fetch,
  scheduled: async (
    _event: ScheduledEvent,
    env: Env,
    _ctx: ExecutionContext,
  ) => {
    await handleWeeklyDigest(env);
  },
};
