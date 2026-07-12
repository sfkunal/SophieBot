import { describe, expect, it } from "vitest";
import { createOAuthState, verifyOAuthState } from "./oauth-state.js";
import { createSessionToken, verifySessionToken } from "./sessions.js";

const SECRET = "test-secret-key-for-hmac-signing";

describe("OAuth state", () => {
  it("round-trips a signed state", async () => {
    const state = await createOAuthState("user-123", SECRET);
    const parsed = await verifyOAuthState(state, SECRET);
    expect(parsed?.userId).toBe("user-123");
  });

  it("rejects tampered state", async () => {
    const state = await createOAuthState("user-123", SECRET);
    const [payload, sig] = state.split(".");
    const parsed = JSON.parse(atob(payload)) as { userId: string; ts: number };
    parsed.userId = "user-999";
    const tampered = `${btoa(JSON.stringify(parsed))}.${sig}`;
    expect(await verifyOAuthState(tampered, SECRET)).toBeNull();
  });

  it("rejects wrong secret", async () => {
    const state = await createOAuthState("user-123", SECRET);
    expect(await verifyOAuthState(state, "wrong-secret")).toBeNull();
  });
});

describe("session tokens", () => {
  it("round-trips a session token", async () => {
    const token = await createSessionToken("user-1", "+15551234567", SECRET);
    const session = await verifySessionToken(token, SECRET);
    expect(session?.userId).toBe("user-1");
    expect(session?.phone).toBe("+15551234567");
  });

  it("rejects invalid token", async () => {
    expect(await verifySessionToken("not-a-token", SECRET)).toBeNull();
  });
});
