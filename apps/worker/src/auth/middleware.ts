import type { Context, Next } from "hono";
import type { Env } from "../env.js";
import { verifySessionToken, type SessionPayload } from "./sessions.js";

type AuthContext = Context<{ Bindings: Env; Variables: { session: SessionPayload } }>;

export async function requireAuth(
  c: AuthContext,
  next: Next,
): Promise<Response | void> {
  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const session = await verifySessionToken(token, c.env.AUTH_SECRET);
  if (!session) {
    return c.json({ error: "Invalid or expired session" }, 401);
  }

  c.set("session", session);
  await next();
}
