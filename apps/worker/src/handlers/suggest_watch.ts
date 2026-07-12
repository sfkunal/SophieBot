import type { ExtractedIntent } from "@brain/shared";
import { suggestWatchItems } from "../db/watch.js";
import { parseWatchEntities } from "../utils/entities.js";
import type { HandlerContext } from "./index.js";

export async function handleSuggestWatch(
  ctx: HandlerContext,
  intent: ExtractedIntent,
) {
  const e = parseWatchEntities(intent.entities);
  const suggestions = await suggestWatchItems(ctx.env.DB, {
    genre: e.filter_genre ?? e.genre,
    type: e.type,
    mood: e.filter_mood ?? e.mood_tags,
    max_runtime_min: e.filter_runtime_max,
  });

  if (!suggestions.length) {
    return {
      data: { watch_items: [], empty: true },
      followUpQuestion:
        "Nothing in the watchlist matches — got a rec to add?",
    };
  }

  return {
    data: {
      watch_items: suggestions.map((w) => ({
        title: w.title,
        type: w.type,
        genre: w.genre,
        rationale: w.rationale,
        platform: w.platform,
        runtime_min: w.runtime_min,
      })),
    },
  };
}
