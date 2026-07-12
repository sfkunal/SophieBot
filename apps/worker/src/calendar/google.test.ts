import { describe, expect, it } from "vitest";
import { findFreeSlots, isBothFreeAt } from "./google.js";

describe("findFreeSlots", () => {
  it("finds gaps when both users are busy at different times", () => {
    const start = "2026-01-01T09:00:00.000Z";
    const end = "2026-01-01T12:00:00.000Z";
    const userA = [
      {
        user_id: "a",
        start: "2026-01-01T09:00:00.000Z",
        end: "2026-01-01T10:00:00.000Z",
        summary: "Busy",
      },
    ];
    const userB = [
      {
        user_id: "b",
        start: "2026-01-01T10:30:00.000Z",
        end: "2026-01-01T11:00:00.000Z",
        summary: "Busy",
      },
    ];

    const slots = findFreeSlots(start, end, [userA, userB], 30);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.some((s) => s.duration_minutes >= 30)).toBe(true);
  });
});

describe("isBothFreeAt", () => {
  it("returns false when any user is busy", () => {
    const perUser = [
      [
        {
          user_id: "a",
          start: "2026-01-01T18:00:00.000Z",
          end: "2026-01-01T19:00:00.000Z",
          summary: "Dinner",
        },
      ],
      [],
    ];

    expect(
      isBothFreeAt(
        perUser,
        "2026-01-01T18:00:00.000Z",
        "2026-01-01T19:00:00.000Z",
      ),
    ).toBe(false);
  });

  it("returns true when both users are free", () => {
    expect(
      isBothFreeAt(
        [[], []],
        "2026-01-01T18:00:00.000Z",
        "2026-01-01T19:00:00.000Z",
      ),
    ).toBe(true);
  });
});
