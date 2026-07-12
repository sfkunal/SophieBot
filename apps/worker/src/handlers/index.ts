import type { ExtractedIntent, HandlerResult, ReplyComposerData } from "@brain/shared";
import type { Env } from "../env.js";
import { handleAddRestaurant } from "./add_restaurant.js";
import { handleAddWatch } from "./add_watch.js";
import { handleListRestaurants } from "./list_restaurants.js";
import { handleListWatch } from "./list_watch.js";
import { handleSuggestRestaurant } from "./suggest_restaurant.js";
import { handleSuggestWatch } from "./suggest_watch.js";
import { handleMarkDone } from "./mark_done.js";
import { handleVote } from "./vote.js";
import { handleCalendarFree } from "./calendar_free.js";
import { handleCalendarNextSlot } from "./calendar_next_slot.js";
import { handleCalendarSummary } from "./calendar_summary.js";
import { handleHelp } from "./help.js";

export interface HandlerContext {
  env: Env;
  userId?: string | null;
  senderName?: string | null;
}

export async function dispatchIntent(
  intent: ExtractedIntent,
  ctx: HandlerContext,
): Promise<HandlerResult> {
  switch (intent.intent) {
    case "add_restaurant":
      return handleAddRestaurant(ctx, intent);
    case "add_watch":
      return handleAddWatch(ctx, intent);
    case "list_restaurants":
      return handleListRestaurants(ctx);
    case "list_watch":
      return handleListWatch(ctx);
    case "suggest_restaurant":
      return handleSuggestRestaurant(ctx, intent);
    case "suggest_watch":
      return handleSuggestWatch(ctx, intent);
    case "mark_done":
      return handleMarkDone(ctx, intent);
    case "vote":
      return handleVote(ctx, intent);
    case "calendar_free":
      return handleCalendarFree(ctx, intent);
    case "calendar_next_slot":
      return handleCalendarNextSlot(ctx, intent);
    case "calendar_summary":
      return handleCalendarSummary(ctx, intent);
    case "help":
      return handleHelp();
    default:
      return {
        data: { error: "unknown_intent" },
        followUpQuestion:
          "Not sure I got that — try 'help' or tell me a restaurant/show to save?",
      };
  }
}

export function handlerResultToReplyData(
  intent: ExtractedIntent,
  result: HandlerResult,
): ReplyComposerData & { action_taken?: string } {
  const data: ReplyComposerData & { action_taken?: string } = {
    ...(result.data as ReplyComposerData),
    action_taken: intent.intent,
  };
  if (result.followUpQuestion) {
    data.clarifying_needed = true;
    data.clarifying_question = result.followUpQuestion;
  }
  return data;
}

export function extractCalendarContext(
  result: HandlerResult,
): Record<string, unknown> {
  const cal = result.data.calendar as Record<string, unknown> | undefined;
  if (!cal) return {};
  return {
    queried_date: cal.queried_date,
    time_range: cal.time_range,
    both_free: cal.both_free,
    free_slots: cal.free_slots,
    busy_blocks: cal.busy_blocks,
    next_mutual_slot: cal.next_mutual_slot,
    calendar_summary: cal.calendar_summary,
  };
}
