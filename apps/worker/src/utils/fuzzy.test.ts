import { describe, expect, it } from "vitest";
import { bestTitleMatch, titleMatchScore } from "./fuzzy.js";

describe("titleMatchScore", () => {
  it("scores exact matches highest", () => {
    expect(titleMatchScore("Monteverde", "Monteverde")).toBe(100);
  });

  it("scores partial matches", () => {
    expect(titleMatchScore("Monte", "Monteverde")).toBe(80);
  });
});

describe("bestTitleMatch", () => {
  const items = [
    { id: "1", title: "Monteverde" },
    { id: "2", title: "Monte Carlo Pizza" },
    { id: "3", title: "Sushi Dai" },
  ];

  it("returns exact match", () => {
    expect(bestTitleMatch("Monteverde", items)?.id).toBe("1");
  });

  it("returns null when score is too low", () => {
    expect(bestTitleMatch("xyz", items)).toBeNull();
  });

  it("returns null when matches are ambiguous", () => {
    const ambiguous = [
      { id: "a", title: "Pizza Palace" },
      { id: "b", title: "Pizza Planet" },
    ];
    expect(bestTitleMatch("Pizza", ambiguous)).toBeNull();
  });
});
