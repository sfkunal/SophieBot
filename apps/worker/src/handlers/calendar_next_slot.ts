import type { ExtractedIntent } from "@brain/shared";
import {
  fetchAllUsersBusyBlocks,
  findNextMutualSlot,
  weekBounds,
} from "../calendar/google.js";
import { listUsers } from "../db/users.js";
import { parseCalendarEntities } from "../utils/entities.js";
import type { HandlerContext } from "./index.js";

export async function handleCalendarNextSlot(
  ctx: HandlerContext,
  intent: ExtractedIntent,
) {
  const e = parseCalendarEntities(intent.entities);
  const minDuration = e.min_duration_minutes ?? 60;
  const { start, end } = weekBounds(new Date());

  const users = await listUsers(ctx.env.DB);
  const linked = users.filter((u) => u.google_refresh_token);

  if (linked.length < 2) {
    return {
      data: {
        calendar: {
          next_mutual_slot: null,
          calendar_summary:
            "Both calendars need to be linked before I can find mutual free time.",
        },
      },
    };
  }

  const allBusy = await fetchAllUsersBusyBlocks(ctx.env, start, end);
  const perUserBlocks = allBusy.map((x) => x.blocks);
  const slot = findNextMutualSlot(
    start,
    end,
    perUserBlocks,
    minDuration,
  );

  return {
    data: {
      calendar: {
        next_mutual_slot: slot,
        free_slots: slot ? [slot] : [],
      },
    },
  };
}
