import type { ExtractedIntent } from "@brain/shared";
import {
  dayBounds,
  fetchAllUsersBusyBlocks,
  formatCalendarSummary,
  parseDateInput,
} from "../calendar/google.js";
import { listUsers } from "../db/users.js";
import { parseCalendarEntities } from "../utils/entities.js";
import type { HandlerContext } from "./index.js";

export async function handleCalendarSummary(
  ctx: HandlerContext,
  intent: ExtractedIntent,
) {
  const e = parseCalendarEntities(intent.entities);
  const date = parseDateInput(e.date);
  const { start, end } = dayBounds(date);

  const users = await listUsers(ctx.env.DB);
  const linked = users.filter((u) => u.google_refresh_token);

  if (!linked.length) {
    return {
      data: {
        calendar: {
          calendar_summary:
            "No Google Calendars linked yet — connect in the dashboard.",
        },
      },
    };
  }

  const allBusy = await fetchAllUsersBusyBlocks(ctx.env, start, end);
  const summary = formatCalendarSummary(allBusy, e.date);

  return {
    data: {
      calendar: {
        queried_date: date.toISOString().slice(0, 10),
        calendar_summary: summary,
        busy_blocks: allBusy.flatMap(({ user, blocks }) =>
          blocks.map((b) => ({
            user_name: user.name ?? user.phone_e164,
            start: b.start,
            end: b.end,
            summary: b.summary,
          })),
        ),
      },
    },
  };
}
