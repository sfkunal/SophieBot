import type { ExtractedIntent } from "@brain/shared";
import {
  listRestaurants,
  markRestaurantDone,
} from "../db/restaurants.js";
import { listWatchItems, markWatchDone } from "../db/watch.js";
import {
  parseWatchEntities,
  parseRestaurantEntities,
} from "../utils/entities.js";
import { bestTitleMatch } from "../utils/fuzzy.js";
import type { HandlerContext } from "./index.js";

export async function handleMarkDone(
  ctx: HandlerContext,
  intent: ExtractedIntent,
) {
  const watchE = parseWatchEntities(intent.entities);
  const restE = parseRestaurantEntities(intent.entities);
  const title = watchE.title ?? restE.title;
  const itemType =
    watchE.item_type ??
    (watchE.title && !restE.title ? "watch" : undefined) ??
    (restE.title && !watchE.title ? "restaurant" : undefined);

  if (!title) {
    return {
      data: { error: "missing_title" },
      followUpQuestion: "What did you finish — restaurant or show/movie?",
    };
  }

  if (itemType === "restaurant" || (!itemType && restE.title)) {
    const queued = await listRestaurants(ctx.env.DB, "queued");
    const match = bestTitleMatch(title, queued);
    if (match) {
      await markRestaurantDone(ctx.env.DB, match.id);
      return {
        data: {
          marked_done: { title: match.title, item_type: "restaurant" },
        },
      };
    }
  }

  if (itemType === "watch" || !itemType) {
    const queued = await listWatchItems(ctx.env.DB, "queued");
    const match = bestTitleMatch(title, queued);
    if (match) {
      await markWatchDone(ctx.env.DB, match.id);
      return {
        data: {
          marked_done: { title: match.title, item_type: "watch" },
        },
      };
    }
  }

  return {
    data: { error: "not_found", query: title },
    followUpQuestion: `Couldn't find "${title}" on either list — typo, or already done?`,
  };
}
