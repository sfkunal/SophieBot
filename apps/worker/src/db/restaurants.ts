import type { Restaurant, RestaurantStatus, Vibe } from "@brain/shared";
import { newId, nowIso } from "../utils/id.js";

export interface CreateRestaurantInput {
  title: string;
  cuisine?: string | null;
  location?: string | null;
  rationale?: string | null;
  vibe?: Vibe | null;
  source?: string | null;
  notes?: string | null;
  added_by?: string | null;
}

export async function createRestaurant(
  db: D1Database,
  input: CreateRestaurantInput,
): Promise<Restaurant> {
  const restaurant: Restaurant = {
    id: newId(),
    title: input.title,
    cuisine: input.cuisine ?? null,
    location: input.location ?? null,
    rationale: input.rationale ?? null,
    vibe: input.vibe ?? null,
    source: input.source ?? null,
    notes: input.notes ?? null,
    priority: 0,
    status: "queued",
    added_by: input.added_by ?? null,
    added_at: nowIso(),
    completed_at: null,
  };

  await db
    .prepare(
      `INSERT INTO restaurants
       (id, title, cuisine, location, rationale, vibe, source, notes, priority, status, added_by, added_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      restaurant.id,
      restaurant.title,
      restaurant.cuisine,
      restaurant.location,
      restaurant.rationale,
      restaurant.vibe,
      restaurant.source,
      restaurant.notes,
      restaurant.priority,
      restaurant.status,
      restaurant.added_by,
      restaurant.added_at,
      restaurant.completed_at,
    )
    .run();

  return restaurant;
}

export async function listRestaurants(
  db: D1Database,
  status?: RestaurantStatus,
): Promise<Restaurant[]> {
  const query = status
    ? "SELECT * FROM restaurants WHERE status = ? ORDER BY priority DESC, added_at ASC"
    : "SELECT * FROM restaurants ORDER BY priority DESC, added_at ASC";
  const stmt = status
    ? db.prepare(query).bind(status)
    : db.prepare(query);
  const { results } = await stmt.all<Restaurant>();
  return results ?? [];
}

export async function countQueuedRestaurants(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) as c FROM restaurants WHERE status = 'queued'")
    .first<{ c: number }>();
  return row?.c ?? 0;
}

export async function getRecentRestaurants(
  db: D1Database,
  limit = 5,
): Promise<Restaurant[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM restaurants ORDER BY added_at DESC LIMIT ?",
    )
    .bind(limit)
    .all<Restaurant>();
  return results ?? [];
}

export async function markRestaurantDone(
  db: D1Database,
  id: string,
): Promise<Restaurant | null> {
  const completed = nowIso();
  await db
    .prepare(
      "UPDATE restaurants SET status = 'done', completed_at = ? WHERE id = ?",
    )
    .bind(completed, id)
    .run();
  return db
    .prepare("SELECT * FROM restaurants WHERE id = ?")
    .bind(id)
    .first<Restaurant>();
}

export async function dropRestaurant(
  db: D1Database,
  id: string,
): Promise<Restaurant | null> {
  await db
    .prepare("UPDATE restaurants SET status = 'dropped' WHERE id = ?")
    .bind(id)
    .run();
  return db
    .prepare("SELECT * FROM restaurants WHERE id = ?")
    .bind(id)
    .first<Restaurant>();
}

export async function incrementRestaurantPriority(
  db: D1Database,
  id: string,
  amount = 1,
): Promise<Restaurant | null> {
  await db
    .prepare(
      "UPDATE restaurants SET priority = priority + ? WHERE id = ?",
    )
    .bind(amount, id)
    .run();
  return db
    .prepare("SELECT * FROM restaurants WHERE id = ?")
    .bind(id)
    .first<Restaurant>();
}

export interface RestaurantFilters {
  cuisine?: string;
  location?: string;
  vibe?: string;
  rationale_contains?: string;
}

export async function suggestRestaurants(
  db: D1Database,
  filters: RestaurantFilters = {},
  limit = 3,
): Promise<Restaurant[]> {
  const queued = await listRestaurants(db, "queued");
  const filtered = queued.filter((r) => {
    if (
      filters.cuisine &&
      !r.cuisine?.toLowerCase().includes(filters.cuisine.toLowerCase())
    ) {
      return false;
    }
    if (
      filters.location &&
      !r.location?.toLowerCase().includes(filters.location.toLowerCase())
    ) {
      return false;
    }
    if (filters.vibe && r.vibe !== filters.vibe) {
      return false;
    }
    if (
      filters.rationale_contains &&
      !r.rationale
        ?.toLowerCase()
        .includes(filters.rationale_contains.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return filtered
    .sort((a, b) => b.priority - a.priority || a.added_at.localeCompare(b.added_at))
    .slice(0, limit);
}

export async function getStaleRestaurants(
  db: D1Database,
  daysOld: number,
): Promise<Restaurant[]> {
  const cutoff = new Date(
    Date.now() - daysOld * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { results } = await db
    .prepare(
      `SELECT * FROM restaurants
       WHERE status = 'queued' AND added_at < ?
       ORDER BY priority DESC, added_at ASC`,
    )
    .bind(cutoff)
    .all<Restaurant>();
  return results ?? [];
}
