import { listWatchItems } from "../db/watch.js";
import type { HandlerContext } from "./index.js";

export async function handleListWatch(ctx: HandlerContext) {
  const items = await listWatchItems(ctx.env.DB, "queued");

  return {
    data: {
      watch_items: items.map((w) => ({
        title: w.title,
        type: w.type,
        genre: w.genre,
        rationale: w.rationale,
        platform: w.platform,
        runtime_min: w.runtime_min,
      })),
      queue_stats: { watch_queued: items.length },
    },
  };
}
