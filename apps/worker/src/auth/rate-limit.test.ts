import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeRateLimit } from "./rate-limit.js";

type RateLimitRow = { attempt_count: number; window_start: string };

function createMockDb(state: Record<string, RateLimitRow> = {}): D1Database {
  return {
    prepare(sql: string) {
      let boundArgs: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          boundArgs = args;
          return stmt;
        },
        async first<T>() {
          if (sql.includes("SELECT")) {
            const bucketKey = boundArgs[0] as string;
            return (state[bucketKey] ?? null) as T;
          }
          return null as T;
        },
        async run() {
          if (sql.includes("INSERT")) {
            const [bucketKey, windowStart] = boundArgs as [string, string];
            state[bucketKey] = { attempt_count: 1, window_start: windowStart };
          } else if (sql.includes("UPDATE")) {
            const bucketKey = boundArgs[boundArgs.length - 1] as string;
            if (sql.includes("attempt_count = 1")) {
              const windowStart = boundArgs[0] as string;
              state[bucketKey] = {
                attempt_count: 1,
                window_start: windowStart,
              };
            } else if (sql.includes("attempt_count + 1")) {
              state[bucketKey].attempt_count += 1;
            }
          }
          return { success: true, meta: {} };
        },
      };
      return stmt as D1PreparedStatement;
    },
  } as D1Database;
}

describe("consumeRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first attempt for a new bucket", async () => {
    const state: Record<string, RateLimitRow> = {};
    const db = createMockDb(state);

    expect(await consumeRateLimit(db, "login:user-1", 3, 15)).toBe(true);
    expect(state["login:user-1"]).toEqual({
      attempt_count: 1,
      window_start: "2026-01-01T12:00:00.000Z",
    });
  });

  it("allows up to maxAttempts then blocks", async () => {
    const state: Record<string, RateLimitRow> = {};
    const db = createMockDb(state);
    const key = "login:user-1";

    expect(await consumeRateLimit(db, key, 3, 15)).toBe(true);
    expect(await consumeRateLimit(db, key, 3, 15)).toBe(true);
    expect(await consumeRateLimit(db, key, 3, 15)).toBe(true);
    expect(await consumeRateLimit(db, key, 3, 15)).toBe(false);
    expect(state[key].attempt_count).toBe(3);
  });

  it("resets the window after expiry", async () => {
    const state: Record<string, RateLimitRow> = {
      "login:user-1": {
        attempt_count: 3,
        window_start: "2026-01-01T12:00:00.000Z",
      },
    };
    const db = createMockDb(state);

    vi.setSystemTime(new Date("2026-01-01T12:16:00.000Z"));

    expect(await consumeRateLimit(db, "login:user-1", 3, 15)).toBe(true);
    expect(state["login:user-1"]).toEqual({
      attempt_count: 1,
      window_start: "2026-01-01T12:16:00.000Z",
    });
  });
});
