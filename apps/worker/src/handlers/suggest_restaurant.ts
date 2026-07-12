import type { ExtractedIntent } from "@brain/shared";
import { suggestRestaurants } from "../db/restaurants.js";
import { parseRestaurantEntities } from "../utils/entities.js";
import type { HandlerContext } from "./index.js";

export async function handleSuggestRestaurant(
  ctx: HandlerContext,
  intent: ExtractedIntent,
) {
  const e = parseRestaurantEntities(intent.entities);
  const suggestions = await suggestRestaurants(ctx.env.DB, {
    cuisine: e.filter_cuisine ?? e.cuisine,
    location: e.filter_location ?? e.location,
    vibe: e.filter_vibe ?? e.vibe,
  });

  if (!suggestions.length) {
    return {
      data: { restaurants: [], empty: true },
      followUpQuestion:
        "Queue's looking thin for those filters — want to add something new?",
    };
  }

  return {
    data: {
      restaurants: suggestions.map((r) => ({
        title: r.title,
        cuisine: r.cuisine,
        location: r.location,
        rationale: r.rationale,
        priority: r.priority,
      })),
    },
  };
}
