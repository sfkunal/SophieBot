import type { ExtractedIntent } from "@brain/shared";
import {
  incrementRestaurantPriority,
  listRestaurants,
} from "../db/restaurants.js";
import { incrementWatchPriority, listWatchItems } from "../db/watch.js";
import { recordVote } from "../db/votes.js";
import { parseVoteTitle } from "../utils/entities.js";
import { bestTitleMatch } from "../utils/fuzzy.js";
import type { HandlerContext } from "./index.js";

export async function handleVote(
  ctx: HandlerContext,
  intent: ExtractedIntent,
) {
  const { title, item_type } = parseVoteTitle(intent.entities);

  if (!title) {
    return {
      data: { error: "missing_title" },
      followUpQuestion: "What are you +1'ing? Give me the name.",
    };
  }

  if (item_type === "restaurant" || !item_type) {
    const queued = await listRestaurants(ctx.env.DB, "queued");
    const match = bestTitleMatch(title, queued);
    if (match) {
      let priorityIncreased = false;
      if (ctx.userId) {
        const isNew = await recordVote(
          ctx.env.DB,
          "restaurant",
          match.id,
          ctx.userId,
          1,
        );
        if (isNew) {
          await incrementRestaurantPriority(ctx.env.DB, match.id, 1);
          priorityIncreased = true;
        }
      } else {
        await incrementRestaurantPriority(ctx.env.DB, match.id, 1);
        priorityIncreased = true;
      }
      return {
        data: {
          vote_recorded: { title: match.title, item_type: "restaurant" },
          already_voted: !priorityIncreased,
        },
      };
    }
  }

  if (item_type === "watch" || !item_type) {
    const queued = await listWatchItems(ctx.env.DB, "queued");
    const match = bestTitleMatch(title, queued);
    if (match) {
      let priorityIncreased = false;
      if (ctx.userId) {
        const isNew = await recordVote(
          ctx.env.DB,
          "watch",
          match.id,
          ctx.userId,
          1,
        );
        if (isNew) {
          await incrementWatchPriority(ctx.env.DB, match.id, 1);
          priorityIncreased = true;
        }
      } else {
        await incrementWatchPriority(ctx.env.DB, match.id, 1);
        priorityIncreased = true;
      }
      return {
        data: {
          vote_recorded: { title: match.title, item_type: "watch" },
          already_voted: !priorityIncreased,
        },
      };
    }
  }

  return {
    data: { error: "not_found", query: title },
    followUpQuestion: `No "${title}" on the lists to boost — add it first?`,
  };
}
