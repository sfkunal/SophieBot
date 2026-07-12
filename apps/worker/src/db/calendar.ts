import type { CalendarBusyBlock } from "@brain/shared";
import { nowIso } from "../utils/id.js";

export async function getCachedBusyBlocks(
  db: D1Database,
  userId: string,
): Promise<{ blocks: CalendarBusyBlock[]; cachedAt: string } | null> {
  const row = await db
    .prepare(
      "SELECT busy_blocks_json, cached_at FROM calendar_cache WHERE user_id = ?",
    )
    .bind(userId)
    .first<{ busy_blocks_json: string; cached_at: string }>();

  if (!row) return null;
  return {
    blocks: JSON.parse(row.busy_blocks_json) as CalendarBusyBlock[],
    cachedAt: row.cached_at,
  };
}

export async function setCachedBusyBlocks(
  db: D1Database,
  userId: string,
  blocks: CalendarBusyBlock[],
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO calendar_cache (user_id, busy_blocks_json, cached_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET busy_blocks_json = ?, cached_at = ?`,
    )
    .bind(userId, JSON.stringify(blocks), nowIso(), JSON.stringify(blocks), nowIso())
    .run();
}

export function isCacheStale(cachedAt: string, maxAgeMinutes = 15): boolean {
  return Date.now() - new Date(cachedAt).getTime() > maxAgeMinutes * 60_000;
}
