import type { ItemStatus, WatchItem, WatchType } from "@brain/shared";
import { newId, nowIso } from "../utils/id.js";

export interface CreateWatchInput {
  title: string;
  type?: WatchType | null;
  genre?: string | null;
  rationale?: string | null;
  runtime_min?: number | null;
  platform?: string | null;
  mood_tags?: string | null;
  notes?: string | null;
  added_by?: string | null;
}

export async function createWatchItem(
  db: D1Database,
  input: CreateWatchInput,
): Promise<WatchItem> {
  const item: WatchItem = {
    id: newId(),
    title: input.title,
    type: input.type ?? null,
    genre: input.genre ?? null,
    rationale: input.rationale ?? null,
    runtime_min: input.runtime_min ?? null,
    platform: input.platform ?? null,
    mood_tags: input.mood_tags ?? null,
    notes: input.notes ?? null,
    priority: 0,
    status: "queued",
    added_by: input.added_by ?? null,
    added_at: nowIso(),
    completed_at: null,
  };

  await db
    .prepare(
      `INSERT INTO watch_items
       (id, title, type, genre, rationale, runtime_min, platform, mood_tags, notes, priority, status, added_by, added_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      item.id,
      item.title,
      item.type,
      item.genre,
      item.rationale,
      item.runtime_min,
      item.platform,
      item.mood_tags,
      item.notes,
      item.priority,
      item.status,
      item.added_by,
      item.added_at,
      item.completed_at,
    )
    .run();

  return item;
}

export async function listWatchItems(
  db: D1Database,
  status?: ItemStatus,
): Promise<WatchItem[]> {
  const query = status
    ? "SELECT * FROM watch_items WHERE status = ? ORDER BY priority DESC, added_at ASC"
    : "SELECT * FROM watch_items ORDER BY priority DESC, added_at ASC";
  const stmt = status ? db.prepare(query).bind(status) : db.prepare(query);
  const { results } = await stmt.all<WatchItem>();
  return results ?? [];
}

export async function countQueuedWatchItems(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) as c FROM watch_items WHERE status = 'queued'")
    .first<{ c: number }>();
  return row?.c ?? 0;
}

export async function getRecentWatchItems(
  db: D1Database,
  limit = 5,
): Promise<WatchItem[]> {
  const { results } = await db
    .prepare("SELECT * FROM watch_items ORDER BY added_at DESC LIMIT ?")
    .bind(limit)
    .all<WatchItem>();
  return results ?? [];
}

export async function markWatchDone(
  db: D1Database,
  id: string,
): Promise<WatchItem | null> {
  const completed = nowIso();
  await db
    .prepare(
      "UPDATE watch_items SET status = 'done', completed_at = ? WHERE id = ?",
    )
    .bind(completed, id)
    .run();
  return db
    .prepare("SELECT * FROM watch_items WHERE id = ?")
    .bind(id)
    .first<WatchItem>();
}

export async function dropWatchItem(
  db: D1Database,
  id: string,
): Promise<WatchItem | null> {
  await db
    .prepare("UPDATE watch_items SET status = 'dropped' WHERE id = ?")
    .bind(id)
    .run();
  return db
    .prepare("SELECT * FROM watch_items WHERE id = ?")
    .bind(id)
    .first<WatchItem>();
}

export async function incrementWatchPriority(
  db: D1Database,
  id: string,
  amount = 1,
): Promise<WatchItem | null> {
  await db
    .prepare("UPDATE watch_items SET priority = priority + ? WHERE id = ?")
    .bind(amount, id)
    .run();
  return db
    .prepare("SELECT * FROM watch_items WHERE id = ?")
    .bind(id)
    .first<WatchItem>();
}

export interface WatchFilters {
  genre?: string;
  type?: string;
  mood?: string;
  max_runtime_min?: number;
  rationale_contains?: string;
}

export async function suggestWatchItems(
  db: D1Database,
  filters: WatchFilters = {},
  limit = 3,
): Promise<WatchItem[]> {
  const queued = await listWatchItems(db, "queued");
  const filtered = queued.filter((w) => {
    if (
      filters.genre &&
      !w.genre?.toLowerCase().includes(filters.genre.toLowerCase())
    ) {
      return false;
    }
    if (filters.type && w.type !== filters.type) {
      return false;
    }
    if (
      filters.mood &&
      !w.mood_tags?.toLowerCase().includes(filters.mood.toLowerCase())
    ) {
      return false;
    }
    if (
      filters.max_runtime_min &&
      w.runtime_min &&
      w.runtime_min > filters.max_runtime_min
    ) {
      return false;
    }
    if (
      filters.rationale_contains &&
      !w.rationale
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

export async function getStaleWatchItems(
  db: D1Database,
  daysOld: number,
): Promise<WatchItem[]> {
  const cutoff = new Date(
    Date.now() - daysOld * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { results } = await db
    .prepare(
      `SELECT * FROM watch_items
       WHERE status = 'queued' AND added_at < ?
       ORDER BY priority DESC, added_at ASC`,
    )
    .bind(cutoff)
    .all<WatchItem>();
  return results ?? [];
}
