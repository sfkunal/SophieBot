import { newId, nowIso } from "../utils/id.js";

export async function recordVote(
  db: D1Database,
  itemType: "restaurant" | "watch",
  itemId: string,
  userId: string,
  value = 1,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO votes (id, item_type, item_id, user_id, value, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(newId(), itemType, itemId, userId, value, nowIso())
    .run();
}
