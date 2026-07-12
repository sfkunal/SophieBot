import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  deleteItemRequestSchema,
  markDoneRequestSchema,
  phoneVerifyConfirmSchema,
  phoneVerifyRequestSchema,
  telegramVerifyStatusSchema,
} from "@brain/shared";
import type { Env } from "./env.js";
import { isTelegramConfigured } from "./env.js";
import { requireAuth } from "./auth/middleware.js";
import { consumeRateLimit } from "./auth/rate-limit.js";
import { createOAuthState, verifyOAuthState } from "./auth/oauth-state.js";
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
  getUserById,
  getUserByPhone,
  listUsers,
  storeVerificationCode,
  storeTelegramLinkCode,
  storeTelegramVerifyCode,
  updateGoogleRefreshToken,
  verifyCode,
  verifyTelegramPollToken,
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
import { getClientIp } from "./utils/request.js";

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
      if (!origin) {
        try {
          return new URL(c.env.WEB_URL).origin;
        } catch {
          return null;
        }
      }
      return allowed.has(origin) ? origin : null;
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
  if (!c.env.TELEGRAM_WEBHOOK_SECRET?.trim()) {
    return c.json({ error: "TELEGRAM_WEBHOOK_SECRET required" }, 503);
  }
  return handleTelegramWebhook(c.req.raw, c.env);
});

app.get("/api/auth/google/start", requireAuth, async (c) => {
  const session = c.get("session");
  const user = await getUserById(c.env.DB, session.userId);
  if (!user) {
    return c.json({ error: "user not found — onboard first" }, 404);
  }

  const state = await createOAuthState(user.id, c.env.AUTH_SECRET);
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

  const state = await verifyOAuthState(stateRaw, c.env.AUTH_SECRET);
  if (!state) {
    return c.json({ error: "invalid or expired state" }, 400);
  }
  const userId = state.userId;

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
  const clientIp = getClientIp(c.req.raw);

  const phoneAllowed = await consumeRateLimit(
    c.env.DB,
    `verify:phone:${phone}`,
    5,
    15,
  );
  const ipAllowed = await consumeRateLimit(
    c.env.DB,
    `verify:ip:${clientIp}`,
    20,
    15,
  );

  if (!phoneAllowed || !ipAllowed) {
    return c.json({ error: "Too many verification attempts — try again later." }, 429);
  }

  if (!isPhoneInAllowlist(c.env, phone)) {
    return c.json(
      { error: "Phone not on allowlist — ask your partner to add it." },
      403,
    );
  }

  const code = generateVerificationCode();
  await storeVerificationCode(c.env, phone, code);

  const isLocalDev = c.env.APP_URL.includes("localhost");
  let smsSent = true;

  try {
    await sendSms(
      c.env,
      phone,
      `Brain verification code: ${code} (expires in 10 min)`,
    );
  } catch (err) {
    console.error("Verification SMS failed:", err);
    smsSent = false;
  }

  if (isLocalDev) {
    console.log(`[verify] Verification code for ${phone}: ${code}`);
  }

  return c.json({
    ok: true,
    phone,
    sms_sent: smsSent,
    ...(isLocalDev ? { dev_code: code } : {}),
    ...(!isLocalDev && !smsSent
      ? { error_hint: "SMS delivery failed — check Twilio configuration." }
      : {}),
  });
});

app.post("/api/onboard/confirm", async (c) => {
  const parsed = phoneVerifyConfirmSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const phone = normalizePhone(parsed.data.phone);
  const clientIp = getClientIp(c.req.raw);

  const confirmAllowed = await consumeRateLimit(
    c.env.DB,
    `confirm:phone:${phone}`,
    10,
    15,
  );
  const ipAllowed = await consumeRateLimit(
    c.env.DB,
    `confirm:ip:${clientIp}`,
    30,
    15,
  );

  if (!confirmAllowed || !ipAllowed) {
    return c.json({ error: "Too many attempts — try again later." }, 429);
  }

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

app.post("/api/onboard/telegram-verify", async (c) => {
  if (!isTelegramConfigured(c.env)) {
    return c.json({ error: "Telegram is not configured on this server" }, 503);
  }

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

  const clientIp = getClientIp(c.req.raw);
  const phoneAllowed = await consumeRateLimit(
    c.env.DB,
    `tg-verify:phone:${phone}`,
    5,
    15,
  );
  const ipAllowed = await consumeRateLimit(
    c.env.DB,
    `tg-verify:ip:${clientIp}`,
    20,
    15,
  );

  if (!phoneAllowed || !ipAllowed) {
    return c.json({ error: "Too many attempts — try again later." }, 429);
  }

  const { code, pollToken } = await storeTelegramVerifyCode(c.env, phone);
  const botUsername = await getTelegramBotUsername(c.env);

  return c.json({
    ok: true,
    phone,
    code,
    poll_token: pollToken,
    expires_in_minutes: 15,
    bot_username: botUsername,
    instructions: botUsername
      ? `Open @${botUsername} in Telegram and send: /verify ${code}`
      : `Send this to the SophieBot Telegram bot: /verify ${code}`,
  });
});

app.post("/api/onboard/telegram-verify/status", async (c) => {
  const parsed = telegramVerifyStatusSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const phone = normalizePhone(parsed.data.phone);
  const pollValid = await verifyTelegramPollToken(
    c.env,
    phone,
    parsed.data.poll_token,
  );

  if (!pollValid) {
    return c.json({ error: "Invalid or expired poll token" }, 401);
  }

  const user = await getUserByPhone(c.env.DB, phone);

  if (!user?.telegram_chat_id || !isPhoneInAllowlist(c.env, phone)) {
    return c.json({ verified: false });
  }

  const token = await createSessionToken(
    user.id,
    user.phone_e164,
    c.env.AUTH_SECRET,
  );

  return c.json({
    verified: true,
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

  if (allBusy.length < 2) {
    return c.json({
      window: { start, end },
      free_slots: [],
      slots: [],
      events: [],
      week_start: start,
      week_end: end,
      users_linked: allBusy.length,
      message: "Both calendars must be connected to show mutual free time.",
    });
  }

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
