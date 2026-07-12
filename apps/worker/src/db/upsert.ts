import type { CreateRestaurantInput } from "../db/restaurants.js";
import type { CreateWatchInput } from "../db/watch.js";
import type { Restaurant, WatchItem } from "@brain/shared";
import { bestTitleMatch } from "../utils/fuzzy.js";

export function findQueuedWatchMatch(
  items: WatchItem[],
  title: string,
): WatchItem | null {
  return bestTitleMatch(title, items.filter((w) => w.status === "queued"));
}

export function findQueuedRestaurantMatch(
  items: Restaurant[],
  title: string,
): Restaurant | null {
  return bestTitleMatch(title, items.filter((r) => r.status === "queued"));
}

export function mergeWatchFields(
  existing: WatchItem,
  incoming: CreateWatchInput,
): CreateWatchInput {
  return {
    title: existing.title,
    type: incoming.type ?? existing.type,
    genre: incoming.genre ?? existing.genre,
    rationale: incoming.rationale ?? existing.rationale,
    runtime_min: incoming.runtime_min ?? existing.runtime_min,
    platform: incoming.platform ?? existing.platform,
    mood_tags: incoming.mood_tags ?? existing.mood_tags,
    notes: incoming.notes ?? existing.notes,
    added_by: existing.added_by,
  };
}

export function mergeRestaurantFields(
  existing: Restaurant,
  incoming: CreateRestaurantInput,
): CreateRestaurantInput {
  return {
    title: existing.title,
    cuisine: incoming.cuisine ?? existing.cuisine,
    location: incoming.location ?? existing.location,
    rationale: incoming.rationale ?? existing.rationale,
    vibe: incoming.vibe ?? existing.vibe,
    source: incoming.source ?? existing.source,
    notes: incoming.notes ?? existing.notes,
    added_by: existing.added_by,
  };
}

export async function updateWatchItem(
  db: D1Database,
  id: string,
  input: CreateWatchInput,
): Promise<WatchItem | null> {
  const existing = await db
    .prepare("SELECT * FROM watch_items WHERE id = ?")
    .bind(id)
    .first<WatchItem>();

  if (!existing) return null;

  const merged = mergeWatchFields(existing, input);

  await db
    .prepare(
      `UPDATE watch_items
       SET type = ?, genre = ?, rationale = ?, runtime_min = ?, platform = ?, mood_tags = ?, notes = ?
       WHERE id = ?`,
    )
    .bind(
      merged.type,
      merged.genre,
      merged.rationale,
      merged.runtime_min,
      merged.platform,
      merged.mood_tags,
      merged.notes,
      id,
    )
    .run();

  return db.prepare("SELECT * FROM watch_items WHERE id = ?").bind(id).first<WatchItem>();
}

export async function updateRestaurant(
  db: D1Database,
  id: string,
  input: CreateRestaurantInput,
): Promise<Restaurant | null> {
  const existing = await db
    .prepare("SELECT * FROM restaurants WHERE id = ?")
    .bind(id)
    .first<Restaurant>();

  if (!existing) return null;

  const merged = mergeRestaurantFields(existing, input);

  await db
    .prepare(
      `UPDATE restaurants
       SET cuisine = ?, location = ?, rationale = ?, vibe = ?, source = ?, notes = ?
       WHERE id = ?`,
    )
    .bind(
      merged.cuisine,
      merged.location,
      merged.rationale,
      merged.vibe,
      merged.source,
      merged.notes,
      id,
    )
    .run();

  return db
    .prepare("SELECT * FROM restaurants WHERE id = ?")
    .bind(id)
    .first<Restaurant>();
}
