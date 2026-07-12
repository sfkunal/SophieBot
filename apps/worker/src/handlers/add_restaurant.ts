import type { ExtractedIntent } from "@brain/shared";
import { createRestaurant, listRestaurants } from "../db/restaurants.js";
import {
  findQueuedRestaurantMatch,
  updateRestaurant,
} from "../db/upsert.js";
import { parseRestaurantEntities } from "../utils/entities.js";
import type { HandlerContext } from "./index.js";

export async function handleAddRestaurant(
  ctx: HandlerContext,
  intent: ExtractedIntent,
) {
  const e = parseRestaurantEntities(intent.entities);

  if (!e.title) {
    return {
      data: { error: "missing_title" },
      followUpQuestion:
        "Which restaurant are we hoarding this time? Need at least a name.",
    };
  }

  const queued = await listRestaurants(ctx.env.DB, "queued");
  const existing = findQueuedRestaurantMatch(queued, e.title);

  if (existing) {
    const updated = await updateRestaurant(ctx.env.DB, existing.id, {
      title: e.title,
      cuisine: e.cuisine ?? null,
      location: e.location ?? null,
      rationale: e.rationale ?? null,
      vibe: e.vibe ?? null,
      source: e.source ?? null,
      notes: e.notes ?? null,
      added_by: ctx.userId ?? null,
    });

    if (!updated) {
      return { data: { error: "update_failed" } };
    }

    return {
      data: {
        saved_restaurant: {
          id: updated.id,
          title: updated.title,
          cuisine: updated.cuisine,
          location: updated.location,
          rationale: updated.rationale,
          vibe: updated.vibe,
        },
        updated_existing: true,
      },
    };
  }

  const missingCuisine = !e.cuisine;
  const missingLocation = !e.location;

  if (missingCuisine || missingLocation) {
    return {
      data: {
        pending_restaurant: e,
        clarifying_needed: true,
      },
      followUpQuestion:
        missingCuisine && missingLocation
          ? `Got ${e.title} — what kind of food, and where?`
          : missingLocation
            ? `Where is ${e.title}?`
            : `What kind of food is ${e.title}?`,
    };
  }

  const saved = await createRestaurant(ctx.env.DB, {
    title: e.title,
    cuisine: e.cuisine ?? null,
    location: e.location ?? null,
    rationale: e.rationale ?? null,
    vibe: e.vibe ?? null,
    source: e.source ?? null,
    notes: e.notes ?? null,
    added_by: ctx.userId ?? null,
  });

  return {
    data: {
      saved_restaurant: {
        id: saved.id,
        title: saved.title,
        cuisine: saved.cuisine,
        location: saved.location,
        rationale: saved.rationale,
        vibe: saved.vibe,
      },
      updated_existing: false,
    },
  };
}
