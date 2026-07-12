import type { ExtractedIntent, Intent } from "@brain/shared";
import type { PendingFollowUp } from "../db/conversation.js";

function mergeRecords(
  base: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...base };

  for (const [key, value] of Object.entries(incoming)) {
    if (value === null || value === undefined || value === "") continue;

    const existing = out[key];
    if (
      existing &&
      typeof existing === "object" &&
      typeof value === "object" &&
      !Array.isArray(existing) &&
      !Array.isArray(value)
    ) {
      out[key] = mergeRecords(
        existing as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      out[key] = value;
    }
  }

  return out;
}

function promoteRestaurantFollowUpFields(
  entities: Record<string, unknown>,
): Record<string, unknown> {
  const restaurant = {
    ...((entities.restaurant as Record<string, unknown> | undefined) ?? {}),
  };
  const filters = entities.filters as Record<string, unknown> | undefined;

  if (filters?.cuisine && !restaurant.cuisine) {
    restaurant.cuisine = filters.cuisine;
  }
  if (filters?.location && !restaurant.location) {
    restaurant.location = filters.location;
  }
  if (typeof entities.cuisine === "string" && !restaurant.cuisine) {
    restaurant.cuisine = entities.cuisine;
  }
  if (typeof entities.location === "string" && !restaurant.location) {
    restaurant.location = entities.location;
  }

  if (Object.keys(restaurant).length) {
    return { ...entities, restaurant };
  }

  return entities;
}

function promoteWatchFollowUpFields(
  entities: Record<string, unknown>,
): Record<string, unknown> {
  const watch = {
    ...((entities.watch as Record<string, unknown> | undefined) ?? {}),
  };
  const filters = entities.filters as Record<string, unknown> | undefined;

  if (filters?.genre && !watch.genre) watch.genre = filters.genre;
  if (filters?.type && !watch.type) watch.type = filters.type;
  if (typeof entities.genre === "string" && !watch.genre) watch.genre = entities.genre;
  if (typeof entities.type === "string" && !watch.type) watch.type = entities.type;

  if (Object.keys(watch).length) {
    return { ...entities, watch };
  }

  return entities;
}

export function mergePendingIntoIntent(
  intent: ExtractedIntent,
  pending: PendingFollowUp,
): ExtractedIntent {
  const isContinuation =
    intent.intent === pending.intent ||
    intent.intent === "unknown" ||
    (pending.intent === "add_restaurant" &&
      intent.intent === "suggest_restaurant") ||
    (pending.intent === "add_watch" && intent.intent === "suggest_watch");

  if (!isContinuation) {
    return intent;
  }

  let mergedEntities = mergeRecords(pending.entities, intent.entities);

  if (pending.intent === "add_restaurant") {
    mergedEntities = promoteRestaurantFollowUpFields(mergedEntities);
  }

  if (pending.intent === "add_watch") {
    mergedEntities = promoteWatchFollowUpFields(mergedEntities);
  }

  return {
    intent: pending.intent as Intent,
    entities: mergedEntities,
    confidence: Math.max(intent.confidence, 0.9),
    missing_fields: [],
  };
}
