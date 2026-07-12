import { newId, nowIso } from "../utils/id.js";

export async function recordVote(
  db: D1Database,
  itemType: "restaurant" | "watch",
  itemId: string,
  userId: string,
  value = 1,
): Promise<boolean> {
  const existing = await db
    .prepare(
      "SELECT id FROM votes WHERE item_type = ? AND item_id = ? AND user_id = ?",
    )
    .bind(itemType, itemId, userId)
    .first<{ id: string }>();

  if (existing) return false;

  await db
    .prepare(
      `INSERT INTO votes (id, item_type, item_id, user_id, value, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(newId(), itemType, itemId, userId, value, nowIso())
    .run();

  return true;
}
