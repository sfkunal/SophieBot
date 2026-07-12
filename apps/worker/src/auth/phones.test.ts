import { describe, expect, it } from "vitest";
import type { Env } from "../env.js";
import { isPhoneInAllowlist, normalizePhone } from "./phones.js";

function envWithPhones(allowed: string): Env {
  return { ALLOWED_PHONES: allowed } as Env;
}

describe("normalizePhone", () => {
  it("adds +1 prefix to 10-digit US numbers", () => {
    expect(normalizePhone("5551234567")).toBe("+15551234567");
    expect(normalizePhone("(555) 123-4567")).toBe("+15551234567");
  });

  it("adds + prefix to 11-digit numbers starting with 1", () => {
    expect(normalizePhone("15551234567")).toBe("+15551234567");
    expect(normalizePhone("+1 555 123 4567")).toBe("+15551234567");
  });

  it("adds + prefix to other digit lengths", () => {
    expect(normalizePhone("442071234567")).toBe("+442071234567");
  });
});

describe("isPhoneInAllowlist", () => {
  it("returns false when ALLOWED_PHONES is empty", () => {
    expect(isPhoneInAllowlist(envWithPhones(""), "+15551234567")).toBe(false);
    expect(isPhoneInAllowlist(envWithPhones("   "), "+15551234567")).toBe(
      false,
    );
  });

  it("returns true for a phone in the allowlist", () => {
    const env = envWithPhones("+15551234567,+15559876543");
    expect(isPhoneInAllowlist(env, "+15551234567")).toBe(true);
  });

  it("returns false for a phone not in the allowlist", () => {
    const env = envWithPhones("+15551234567");
    expect(isPhoneInAllowlist(env, "+15550000000")).toBe(false);
  });

  it("matches phones regardless of formatting", () => {
    const env = envWithPhones("+15551234567");
    expect(isPhoneInAllowlist(env, "555-123-4567")).toBe(true);
    expect(isPhoneInAllowlist(env, "(555)123-4567")).toBe(true);
  });

  it("parses comma- and whitespace-separated lists", () => {
    const env = envWithPhones("+15551111111, +15552222222\n+15553333333");
    expect(isPhoneInAllowlist(env, "+15552222222")).toBe(true);
    expect(isPhoneInAllowlist(env, "+15553333333")).toBe(true);
  });
});
