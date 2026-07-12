import type { ExtractedIntent } from "@brain/shared";
import { createWatchItem, listWatchItems } from "../db/watch.js";
import {
  findQueuedWatchMatch,
  updateWatchItem,
} from "../db/upsert.js";
import { parseWatchEntities } from "../utils/entities.js";
import type { HandlerContext } from "./index.js";

export async function handleAddWatch(
  ctx: HandlerContext,
  intent: ExtractedIntent,
) {
  const e = parseWatchEntities(intent.entities);

  if (!e.title) {
    return {
      data: { error: "missing_title" },
      followUpQuestion: "What show or movie should I save?",
    };
  }

  const queued = await listWatchItems(ctx.env.DB, "queued");
  const existing = findQueuedWatchMatch(queued, e.title);

  if (existing) {
    const updated = await updateWatchItem(ctx.env.DB, existing.id, {
      title: e.title,
      type: e.type ?? null,
      genre: e.genre ?? null,
      rationale: e.rationale ?? null,
      runtime_min: e.runtime_min ?? null,
      platform: e.platform ?? null,
      mood_tags: e.mood_tags ?? null,
      notes: e.notes ?? null,
      added_by: ctx.userId ?? null,
    });

    if (!updated) {
      return { data: { error: "update_failed" } };
    }

    return {
      data: {
        saved_watch_item: {
          id: updated.id,
          title: updated.title,
          type: updated.type,
          genre: updated.genre,
          rationale: updated.rationale,
          platform: updated.platform,
          runtime_min: updated.runtime_min,
        },
        updated_existing: true,
      },
    };
  }

  const saved = await createWatchItem(ctx.env.DB, {
    title: e.title,
    type: e.type ?? null,
    genre: e.genre ?? null,
    rationale: e.rationale ?? null,
    runtime_min: e.runtime_min ?? null,
    platform: e.platform ?? null,
    mood_tags: e.mood_tags ?? null,
    notes: e.notes ?? null,
    added_by: ctx.userId ?? null,
  });

  return {
    data: {
      saved_watch_item: {
        id: saved.id,
        title: saved.title,
        type: saved.type,
        genre: saved.genre,
        rationale: saved.rationale,
        platform: saved.platform,
        runtime_min: saved.runtime_min,
      },
      updated_existing: false,
    },
  };
}
