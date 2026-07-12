import type { CalendarBusyBlock, FreeSlot, User } from "@brain/shared";
import type { Env } from "../env.js";
import {
  getCachedBusyBlocks,
  isCacheStale,
  setCachedBusyBlocks,
} from "../db/calendar.js";
import { listUsers } from "../db/users.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
}

interface GoogleCalendarEvent {
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

interface GoogleEventsResponse {
  items?: GoogleCalendarEvent[];
}

export async function refreshAccessToken(
  env: Env,
  refreshToken: string,
): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${await res.text()}`);
  }

  const data = (await res.json()) as GoogleTokenResponse;
  return data.access_token;
}

export function getOAuthUrl(env: Env, state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCodeForTokens(
  env: Env,
  code: string,
): Promise<{ access_token: string; refresh_token?: string }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: env.GOOGLE_REDIRECT_URI,
    }),
  });

  if (!res.ok) {
    throw new Error(`Google code exchange failed: ${await res.text()}`);
  }

  return res.json();
}

function eventDateTime(
  point: { dateTime?: string; date?: string } | undefined,
): string | null {
  if (!point) return null;
  if (point.dateTime) return point.dateTime;
  if (point.date) return `${point.date}T00:00:00.000Z`;
  return null;
}

function blocksOverlapWindow(
  block: CalendarBusyBlock,
  timeMin: string,
  timeMax: string,
): boolean {
  return block.start < timeMax && block.end > timeMin;
}

async function fetchEventsFromGoogle(
  accessToken: string,
  timeMin: string,
  timeMax: string,
): Promise<Array<{ start: string; end: string; summary: string }>> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });

  const res = await fetch(`${EVENTS_URL}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Google events list failed: ${await res.text()}`);
  }

  const data = (await res.json()) as GoogleEventsResponse;
  return (data.items ?? [])
    .map((event) => {
      const start = eventDateTime(event.start);
      const end = eventDateTime(event.end);
      if (!start || !end) return null;
      return {
        start,
        end,
        summary: event.summary?.trim() || "Busy",
      };
    })
    .filter((block): block is { start: string; end: string; summary: string } =>
      block !== null,
    );
}

export async function fetchBusyBlocksForUser(
  env: Env,
  user: User,
  timeMin: string,
  timeMax: string,
  forceRefresh = false,
): Promise<CalendarBusyBlock[]> {
  if (!user.google_refresh_token) return [];

  const cached = forceRefresh ? null : await getCachedBusyBlocks(env.DB, user.id);
  if (cached && !isCacheStale(cached.cachedAt)) {
    return cached.blocks.filter((b) => blocksOverlapWindow(b, timeMin, timeMax));
  }

  const accessToken = await refreshAccessToken(
    env,
    user.google_refresh_token,
  );

  const events = await fetchEventsFromGoogle(accessToken, timeMin, timeMax);
  const blocks: CalendarBusyBlock[] = events.map((event) => ({
    user_id: user.id,
    start: event.start,
    end: event.end,
    summary: event.summary,
  }));

  await setCachedBusyBlocks(env.DB, user.id, blocks);
  return blocks.filter((b) => blocksOverlapWindow(b, timeMin, timeMax));
}

export async function fetchAllUsersBusyBlocks(
  env: Env,
  timeMin: string,
  timeMax: string,
  forceRefresh = false,
): Promise<Array<{ user: User; blocks: CalendarBusyBlock[] }>> {
  const users = await listUsers(env.DB);
  const linked = users.filter((u) => u.google_refresh_token);

  const results = await Promise.all(
    linked.map(async (user) => ({
      user,
      blocks: await fetchBusyBlocksForUser(
        env,
        user,
        timeMin,
        timeMax,
        forceRefresh,
      ),
    })),
  );

  return results;
}

function parseDateInput(dateStr?: string): Date {
  if (!dateStr) return new Date();
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function dayBounds(date: Date): { start: string; end: string } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function weekBounds(from: Date): { start: string; end: string } {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(from);
  end.setDate(end.getDate() + 7);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function mergeBusyBlocks(
  blocks: CalendarBusyBlock[],
): Array<{ start: number; end: number }> {
  if (!blocks.length) return [];
  const sorted = blocks
    .map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
    .sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push(sorted[i]);
    }
  }
  return merged;
}

export function findFreeSlots(
  windowStart: string,
  windowEnd: string,
  allBusy: CalendarBusyBlock[][],
  minDurationMin = 60,
): FreeSlot[] {
  const wStart = new Date(windowStart).getTime();
  const wEnd = new Date(windowEnd).getTime();
  const minMs = minDurationMin * 60_000;

  const combined: CalendarBusyBlock[] = allBusy.flat();
  const busyMerged = mergeBusyBlocks(combined);

  const slots: FreeSlot[] = [];
  let cursor = wStart;

  for (const busy of busyMerged) {
    if (busy.start > cursor && busy.start - cursor >= minMs) {
      slots.push({
        start: new Date(cursor).toISOString(),
        end: new Date(busy.start).toISOString(),
        duration_minutes: Math.round((busy.start - cursor) / 60_000),
      });
    }
    cursor = Math.max(cursor, busy.end);
  }

  if (wEnd - cursor >= minMs) {
    slots.push({
      start: new Date(cursor).toISOString(),
      end: new Date(wEnd).toISOString(),
      duration_minutes: Math.round((wEnd - cursor) / 60_000),
    });
  }

  return slots;
}

export function findNextMutualSlot(
  windowStart: string,
  windowEnd: string,
  perUserBusy: CalendarBusyBlock[][],
  minDurationMin = 60,
): FreeSlot | null {
  if (perUserBusy.length === 0) return null;

  const wStart = new Date(windowStart).getTime();
  const wEnd = new Date(windowEnd).getTime();
  const minMs = minDurationMin * 60_000;

  const mergedPerUser = perUserBusy.map(mergeBusyBlocks);

  let cursor = wStart;
  while (cursor + minMs <= wEnd) {
    const slotEnd = cursor + minMs;
    const allFree = mergedPerUser.every((busy) =>
      !busy.some((b) => overlaps(cursor, slotEnd, b.start, b.end)),
    );
    if (allFree) {
      return {
        start: new Date(cursor).toISOString(),
        end: new Date(slotEnd).toISOString(),
        duration_minutes: minDurationMin,
      };
    }
    cursor += 15 * 60_000;
  }

  return null;
}

export function isBothFreeAt(
  perUserBusy: CalendarBusyBlock[][],
  start: string,
  end: string,
): boolean {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return perUserBusy.every((blocks) => {
    const merged = mergeBusyBlocks(blocks);
    return !merged.some((b) => overlaps(s, e, b.start, b.end));
  });
}

export function formatCalendarSummary(
  usersWithBlocks: Array<{ user: User; blocks: CalendarBusyBlock[] }>,
  dateStr?: string,
): string {
  const date = parseDateInput(dateStr);
  const label = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const lines: string[] = [`Calendar for ${label}:`];
  for (const { user, blocks } of usersWithBlocks) {
    const name = user.name ?? user.phone_e164;
    if (!blocks.length) {
      lines.push(`${name}: wide open`);
      continue;
    }
    const items = blocks
      .slice(0, 8)
      .map((b) => {
        const start = new Date(b.start).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });
        const end = new Date(b.end).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });
        const title = b.summary ?? "Busy";
        return `${start}–${end}: ${title}`;
      });
    lines.push(`${name}: ${items.join(", ")}`);
  }
  return lines.join("\n");
}

export { dayBounds, weekBounds, parseDateInput };
