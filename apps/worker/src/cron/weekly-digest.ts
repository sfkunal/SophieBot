import type { Env } from "../env.js";
import { getStaleRestaurants } from "../db/restaurants.js";
import { getStaleWatchItems } from "../db/watch.js";
import { listUsers } from "../db/users.js";
import { preferredOutboundTarget, sendOutboundMessage } from "../messaging/send.js";

const STALE_DAYS = 30;

export async function handleWeeklyDigest(env: Env): Promise<void> {
  const users = await listUsers(env.DB);
  if (!users.length) return;

  const staleRestaurants = await getStaleRestaurants(env.DB, STALE_DAYS);
  const staleWatch = await getStaleWatchItems(env.DB, STALE_DAYS);

  if (!staleRestaurants.length && !staleWatch.length) return;

  const lines: string[] = ["Weekly nudge from SophieBot 🧠"];

  if (staleRestaurants.length) {
    lines.push(
      "",
      `Restaurants collecting dust (${staleRestaurants.length}):`,
      ...staleRestaurants.slice(0, 3).map((r) => {
        const meta = [r.cuisine, r.location].filter(Boolean).join(", ");
        return `• ${r.title}${meta ? ` (${meta})` : ""}`;
      }),
    );
  }

  if (staleWatch.length) {
    lines.push(
      "",
      `Watchlist guilt trip (${staleWatch.length}):`,
      ...staleWatch.slice(0, 3).map((w) => {
        const meta = [w.genre, w.type].filter(Boolean).join(", ");
        return `• ${w.title}${meta ? ` (${meta})` : ""}`;
      }),
    );
  }

  lines.push("", "Reply 'suggest restaurant' or 'suggest watch' if you're feeling decisive.");

  const body = lines.join("\n").slice(0, 1500);

  for (const user of users) {
    try {
      const target = preferredOutboundTarget(user);
      await sendOutboundMessage(env, target, body);
    } catch (err) {
      console.error(`Digest failed for ${user.phone_e164}:`, err);
    }
  }
}
