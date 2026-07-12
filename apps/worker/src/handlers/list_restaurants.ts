import { listRestaurants } from "../db/restaurants.js";
import type { HandlerContext } from "./index.js";

export async function handleListRestaurants(ctx: HandlerContext) {
  const restaurants = await listRestaurants(ctx.env.DB, "queued");

  return {
    data: {
      restaurants: restaurants.map((r) => ({
        title: r.title,
        cuisine: r.cuisine,
        location: r.location,
        rationale: r.rationale,
        priority: r.priority,
      })),
      queue_stats: { restaurants_queued: restaurants.length },
    },
  };
}
