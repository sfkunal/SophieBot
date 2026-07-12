import { nowIso } from "../utils/id.js";

export async function consumeRateLimit(
  db: D1Database,
  bucketKey: string,
  maxAttempts: number,
  windowMinutes: number,
): Promise<boolean> {
  const now = Date.now();
  const windowMs = windowMinutes * 60_000;

  const row = await db
    .prepare(
      "SELECT attempt_count, window_start FROM rate_limit_buckets WHERE bucket_key = ?",
    )
    .bind(bucketKey)
    .first<{ attempt_count: number; window_start: string }>();

  if (!row) {
    await db
      .prepare(
        `INSERT INTO rate_limit_buckets (bucket_key, attempt_count, window_start)
         VALUES (?, 1, ?)`,
      )
      .bind(bucketKey, nowIso())
      .run();
    return true;
  }

  const windowStart = new Date(row.window_start).getTime();
  if (now - windowStart > windowMs) {
    await db
      .prepare(
        `UPDATE rate_limit_buckets
         SET attempt_count = 1, window_start = ?
         WHERE bucket_key = ?`,
      )
      .bind(nowIso(), bucketKey)
      .run();
    return true;
  }

  if (row.attempt_count >= maxAttempts) {
    return false;
  }

  await db
    .prepare(
      "UPDATE rate_limit_buckets SET attempt_count = attempt_count + 1 WHERE bucket_key = ?",
    )
    .bind(bucketKey)
    .run();
  return true;
}
