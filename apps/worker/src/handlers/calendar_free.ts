import type { ExtractedIntent } from "@brain/shared";
import {
  dayBounds,
  fetchAllUsersBusyBlocks,
  isBothFreeAt,
  parseDateInput,
} from "../calendar/google.js";
import { listUsers } from "../db/users.js";
import { parseCalendarEntities } from "../utils/entities.js";
import type { HandlerContext } from "./index.js";

export async function handleCalendarFree(
  ctx: HandlerContext,
  intent: ExtractedIntent,
) {
  const e = parseCalendarEntities(intent.entities);
  const date = parseDateInput(e.date);
  const { start, end } = dayBounds(date);

  const users = await listUsers(ctx.env.DB);
  const linked = users.filter((u) => u.google_refresh_token);

  if (linked.length < 2) {
    return {
      data: {
        calendar: {
          both_free: false,
          calendar_summary:
            "Need both people connected to Google Calendar first — hit the dashboard to link.",
        },
      },
    };
  }

  const allBusy = await fetchAllUsersBusyBlocks(ctx.env, start, end);
  const perUserBlocks = allBusy.map((x) => x.blocks);

  let checkStart = start;
  let checkEnd = end;

  if (e.time_range) {
    const match = e.time_range.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi);
    if (match && match.length >= 1) {
      const base = new Date(date);
      const parseTime = (t: string) => {
        const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        if (!m) return base;
        let h = parseInt(m[1], 10);
        const min = parseInt(m[2] ?? "0", 10);
        const ampm = m[3]?.toLowerCase();
        if (ampm === "pm" && h < 12) h += 12;
        if (ampm === "am" && h === 12) h = 0;
        const d = new Date(base);
        d.setHours(h, min, 0, 0);
        return d;
      };
      checkStart = parseTime(match[0]).toISOString();
      checkEnd = match[1]
        ? parseTime(match[1]).toISOString()
        : new Date(parseTime(match[0]).getTime() + 60 * 60_000).toISOString();
    }
  }

  const bothFree = isBothFreeAt(perUserBlocks, checkStart, checkEnd);

  return {
    data: {
      calendar: {
        queried_date: date.toISOString().slice(0, 10),
        time_range: e.time_range ?? null,
        both_free: bothFree,
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
