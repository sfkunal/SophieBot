import type { CalendarContext } from "@brain/shared";
import type { Env } from "../env.js";
import { isPhoneAuthorized } from "../auth/phones.js";
import { isTelegramLinked } from "../auth/telegram.js";
import {
  claimTelegramLinkCode,
  getUserByPhone,
  getUserByTelegramChatId,
} from "../db/users.js";
import {
  countQueuedRestaurants,
  getRecentRestaurants,
} from "../db/restaurants.js";
import {
  countQueuedWatchItems,
  getRecentWatchItems,
} from "../db/watch.js";
import { logInboundMessage } from "../db/messages.js";
import {
  buildPendingFollowUp,
  clearConversationState,
  conversationSenderKey,
  getConversationState,
  getRecentConversation,
  getRecentSavedItem,
  isFollowUpCompleted,
  setConversationState,
  setRecentSavedItem,
} from "../db/conversation.js";
import {
  dispatchIntent,
  extractCalendarContext,
  handlerResultToReplyData,
} from "../handlers/index.js";
import { extractIntent, composeReply } from "../llm/openai.js";
import { mergePendingIntoIntent } from "../utils/merge-intent.js";
import { applyEnrichmentContext } from "../utils/enrichment.js";
import {
  parseTwilioForm,
  parseTwilioInbound,
  resolveTwilioWebhookUrl,
  twimlReply,
  verifyTwilioSignature,
} from "../sms/twilio.js";
import {
  parseTelegramUpdate,
  sendTelegramMessage,
  verifyTelegramWebhook,
} from "./telegram.js";
import type { InboundMessageContext } from "./types.js";

const UNAUTHORIZED_SMS =
  "Hey — you're not on the SophieBot list yet. Hit the dashboard to verify your number.";
const UNAUTHORIZED_TELEGRAM =
  "Hey — link your Telegram on the SophieBot setup page first, then message me again.";
const INTENT_FAILURE =
  "SophieBot had a moment — try again in a sec? (Or text 'help' for commands.)";
const REPLY_FAILURE =
  "Done (probably). SophieBot's mouth is broken though — check the dashboard.";

export async function processInboundMessage(
  env: Env,
  ctx: InboundMessageContext,
): Promise<string> {
  const authorized =
    ctx.channel === "sms"
      ? await isPhoneAuthorized(env, ctx.senderId)
      : await isTelegramLinked(env, ctx.senderId);

  if (!authorized) {
    const msg = ctx.channel === "sms" ? UNAUTHORIZED_SMS : UNAUTHORIZED_TELEGRAM;
    await logInboundMessage(env.DB, ctx.senderId, ctx.body, null, msg, ctx.channel);
    return msg;
  }

  const user =
    ctx.channel === "sms"
      ? await getUserByPhone(env.DB, ctx.senderId)
      : await getUserByTelegramChatId(env.DB, ctx.senderId);

  const senderKey = conversationSenderKey(ctx.channel, ctx.senderId);

  const [restaurantCount, watchCount, recentRestaurants, recentWatch, conversationHistory, pendingFollowUp, recentSaved] =
    await Promise.all([
      countQueuedRestaurants(env.DB),
      countQueuedWatchItems(env.DB),
      getRecentRestaurants(env.DB, 5),
      getRecentWatchItems(env.DB, 5),
      getRecentConversation(env.DB, ctx.senderId, ctx.channel, 4),
      getConversationState(env.DB, senderKey),
      getRecentSavedItem(env.DB, senderKey),
    ]);

  let intent;
  try {
    intent = await extractIntent(env, ctx.body, {
      sender_name: user?.name,
      restaurant_count: restaurantCount,
      watch_count: watchCount,
      recent_restaurants: recentRestaurants.map((r) => ({
        title: r.title,
        cuisine: r.cuisine,
      })),
      recent_watch_items: recentWatch.map((w) => ({
        title: w.title,
        genre: w.genre,
      })),
      conversation_history: conversationHistory,
      pending_follow_up: pendingFollowUp ?? undefined,
    });

    if (pendingFollowUp) {
      intent = mergePendingIntoIntent(intent, pendingFollowUp);
    } else if (recentSaved) {
      intent = applyEnrichmentContext(intent, ctx.body, recentSaved);
    }
  } catch (err) {
    console.error("Intent extraction failed:", err);
    await logInboundMessage(
      env.DB,
      ctx.senderId,
      ctx.body,
      null,
      INTENT_FAILURE,
      ctx.channel,
    );
    return INTENT_FAILURE;
  }

  const handlerResult = await dispatchIntent(intent, {
    env,
    userId: user?.id ?? null,
    senderName: user?.name,
  });

  const replyData = handlerResultToReplyData(intent, handlerResult);
  const calendarContext = extractCalendarContext(handlerResult) as CalendarContext;

  let reply: string;
  try {
    reply = await composeReply(env, intent, replyData, calendarContext);
  } catch (err) {
    console.error("Reply composition failed:", err);
    reply = handlerResult.followUpQuestion ?? REPLY_FAILURE;
  }

  if (handlerResult.followUpQuestion && intent.confidence < 0.5) {
    reply = handlerResult.followUpQuestion;
  }

  const handlerData = handlerResult.data as Record<string, unknown>;
  const pending = buildPendingFollowUp(
    intent,
    handlerData,
    handlerResult.followUpQuestion,
  );

  if (pending && !isFollowUpCompleted(handlerData)) {
    await setConversationState(env.DB, senderKey, ctx.channel, pending);
  } else {
    await clearConversationState(env.DB, senderKey);
  }

  const savedWatch = handlerData.saved_watch_item as
    | { id?: string; title?: string }
    | undefined;
  const savedRestaurant = handlerData.saved_restaurant as
    | { id?: string; title?: string }
    | undefined;

  if (savedWatch?.id && savedWatch.title) {
    await setRecentSavedItem(env.DB, senderKey, ctx.channel, {
      item_type: "watch",
      item_id: savedWatch.id,
      title: savedWatch.title,
    });
  } else if (savedRestaurant?.id && savedRestaurant.title) {
    await setRecentSavedItem(env.DB, senderKey, ctx.channel, {
      item_type: "restaurant",
      item_id: savedRestaurant.id,
      title: savedRestaurant.title,
    });
  }

  await logInboundMessage(env.DB, ctx.senderId, ctx.body, intent, reply, ctx.channel);
  return reply;
}

export async function handleTwilioWebhook(
  request: Request,
  env: Env,
): Promise<Response> {
  const rawBody = await request.text();
  const params = parseTwilioForm(rawBody);
  const inbound = parseTwilioInbound(params);
  const signature = request.headers.get("X-Twilio-Signature") ?? "";
  const webhookUrl = resolveTwilioWebhookUrl(request);

  const valid = await verifyTwilioSignature(
    env.TWILIO_AUTH_TOKEN,
    signature,
    webhookUrl,
    params,
  );

  if (!valid) {
    return new Response("Invalid signature", { status: 403 });
  }

  if (!inbound.from || !inbound.body) {
    return new Response("Bad request", { status: 400 });
  }

  const reply = await processInboundMessage(env, {
    channel: "sms",
    senderId: inbound.from,
    body: inbound.body,
  });

  return new Response(twimlReply(reply), {
    headers: { "Content-Type": "text/xml" },
  });
}

async function handleTelegramCommand(
  env: Env,
  inbound: {
    chatId: string;
    userId: string;
    body: string;
  },
): Promise<string | null> {
  const text = inbound.body.trim();
  const parsed = parseTelegramCommand(text);
  const linked = await isTelegramLinked(env, inbound.chatId);

  if (parsed.command === "start") {
    if (linked) {
      return "You're linked! Message me like you'd text SophieBot — add restaurants, check the watchlist, find free time, etc. (Try 'help' for commands.)";
    }
    return [
      "Welcome to SophieBot!",
      "",
      "1. Open the setup page in your browser",
      "2. Tap \"Connect Telegram\" to get a link code",
      "3. Send: /link YOUR_CODE",
    ].join("\n");
  }

  if (parsed.command === "link" || (!linked && isTelegramLinkCode(text))) {
    if (linked) {
      return "You're already linked! Just message me normally — try 'help' for commands.";
    }

    const code = (parsed.args || text).trim().toUpperCase();
    if (!code) {
      return "Send your link code like this: /link ABCD1234";
    }

    const user = await claimTelegramLinkCode(
      env,
      code,
      inbound.chatId,
      inbound.userId,
    );

    if (!user) {
      return "That code didn't work — grab a fresh one from the setup page (they expire in 15 min).";
    }

    return `Linked! You're connected as ${user.phone_e164.slice(-4)}. Message me anytime — try 'help' for commands.`;
  }

  return null;
}

function parseTelegramCommand(
  text: string,
): { command: string | null; args: string } {
  const match = text.trim().match(/^\/([a-zA-Z0-9_]+)(?:@[\w]+)?(?:\s+(.*))?$/s);
  if (!match) {
    return { command: null, args: "" };
  }
  return {
    command: match[1].toLowerCase(),
    args: (match[2] ?? "").trim(),
  };
}

function isTelegramLinkCode(text: string): boolean {
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(
    text.trim().toUpperCase(),
  );
}

export async function handleTelegramWebhook(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!verifyTelegramWebhook(request, env.TELEGRAM_WEBHOOK_SECRET)) {
    return new Response("Invalid secret", { status: 403 });
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const inbound = parseTelegramUpdate(update);
  if (!inbound) {
    return new Response("ok");
  }

  const commandReply = await handleTelegramCommand(env, inbound);
  if (commandReply) {
    try {
      await sendTelegramMessage(env, inbound.chatId, commandReply);
    } catch (err) {
      console.error("Telegram command reply failed:", err);
    }
    return new Response("ok");
  }

  const reply = await processInboundMessage(env, {
    channel: "telegram",
    senderId: inbound.chatId,
    body: inbound.body,
  });

  try {
    await sendTelegramMessage(env, inbound.chatId, reply);
  } catch (err) {
    console.error("Telegram reply failed:", err);
  }

  return new Response("ok");
}
