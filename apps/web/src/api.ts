import type { FreeSlot, Restaurant, WatchItem } from "@brain/shared";

declare global {
  interface Window {
    __BRAIN_CONFIG__?: {
      API_BASE_URL?: string;
    };
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface Session {
  token: string;
  phone: string;
}

export interface SetupUser {
  phone_masked: string;
  verified: boolean;
  calendar_connected: boolean;
  telegram_linked?: boolean;
  name?: string | null;
}

export interface TelegramLinkCodeResponse {
  ok: boolean;
  code: string;
  expires_in_minutes: number;
  bot_username: string | null;
  instructions: string;
}

export interface TelegramVerifyStartResponse {
  ok: boolean;
  phone: string;
  code: string;
  poll_token: string;
  expires_in_minutes: number;
  bot_username: string | null;
  instructions: string;
}

export interface TelegramVerifyStatusResponse {
  verified: boolean;
  token?: string;
  phone?: string;
}

export interface SetupStatus {
  users: SetupUser[];
  ready: boolean;
}

export interface DashboardStats {
  restaurants_queued: number;
  restaurants_done: number;
  watch_queued: number;
  watch_watching: number;
}

export interface CalendarEvent {
  user_name: string;
  start: string;
  end: string;
  summary: string;
}

export interface CalendarSlotsResponse {
  slots: FreeSlot[];
  free_slots?: FreeSlot[];
  events?: CalendarEvent[];
  week_start?: string;
  week_end?: string;
}

const SESSION_KEY = "brain_session";

export function getApiBaseUrl(): string {
  const fromConfig = window.__BRAIN_CONFIG__?.API_BASE_URL?.trim();
  if (fromConfig) return fromConfig.replace(/\/$/, "");

  const fromEnv = import.meta.env.VITE_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  return "http://localhost:8787";
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed.token || !parsed.phone) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  const session = getSession();
  if (auth && session?.token) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "error" in payload
        ? String((payload as { error: unknown }).error)
        : typeof payload === "string" && payload
          ? payload
          : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (input.startsWith("+")) return `+${digits}`;
  return `+${digits}`;
}

export interface VerifyPhoneResponse {
  ok: boolean;
  phone?: string;
  dev_code?: string;
  sms_sent?: boolean;
  error_hint?: string;
}

export async function verifyPhone(phone: string): Promise<VerifyPhoneResponse> {
  return request("/api/onboard/verify", {
    method: "POST",
    body: JSON.stringify({ phone: normalizePhone(phone) }),
  }, false);
}

export async function confirmPhone(
  phone: string,
  code: string,
): Promise<{ ok: boolean; token: string; phone: string }> {
  return request("/api/onboard/confirm", {
    method: "POST",
    body: JSON.stringify({
      phone: normalizePhone(phone),
      code: code.trim(),
    }),
  }, false);
}

export async function startTelegramVerify(
  phone: string,
): Promise<TelegramVerifyStartResponse> {
  return request("/api/onboard/telegram-verify", {
    method: "POST",
    body: JSON.stringify({ phone: normalizePhone(phone) }),
  }, false);
}

export async function checkTelegramVerifyStatus(
  phone: string,
  pollToken: string,
): Promise<TelegramVerifyStatusResponse> {
  return request("/api/onboard/telegram-verify/status", {
    method: "POST",
    body: JSON.stringify({
      phone: normalizePhone(phone),
      poll_token: pollToken,
    }),
  }, false);
}

export async function getSetupStatus(): Promise<SetupStatus> {
  return request("/api/onboard/status");
}

export async function getTelegramLinkCode(): Promise<TelegramLinkCodeResponse> {
  return request("/api/telegram/link-code", { method: "POST" });
}

export async function startGoogleAuth(): Promise<void> {
  const session = getSession();
  if (!session?.token) {
    throw new ApiError("Sign in first", 401);
  }

  const response = await fetch(`${getApiBaseUrl()}/api/auth/google/start`, {
    method: "GET",
    headers: { Authorization: `Bearer ${session.token}` },
    redirect: "manual",
  });

  if (response.status === 401 || response.status === 403) {
    throw new ApiError("Session expired — sign in again.", response.status);
  }

  const location = response.headers.get("Location");
  if (response.status >= 300 && response.status < 400 && location) {
    window.location.href = location;
    return;
  }

  if (!response.ok) {
    throw new ApiError("Could not start Google sign-in.", response.status);
  }
}

export async function getRestaurants(): Promise<Restaurant[]> {
  const data = await request<{ restaurants?: Restaurant[] } | Restaurant[]>(
    "/api/restaurants",
  );
  return Array.isArray(data) ? data : (data.restaurants ?? []);
}

export async function getWatchlist(): Promise<WatchItem[]> {
  const data = await request<{ watch_items?: WatchItem[]; watch?: WatchItem[] } | WatchItem[]>(
    "/api/watch",
  );
  if (Array.isArray(data)) return data;
  return data.watch_items ?? data.watch ?? [];
}

export async function markDone(
  itemType: "restaurant" | "watch",
  id: string,
): Promise<{ ok: boolean }> {
  return request("/api/mark-done", {
    method: "POST",
    body: JSON.stringify({ item_type: itemType, id }),
  });
}

export async function deleteItem(
  itemType: "restaurant" | "watch",
  id: string,
): Promise<{ ok: boolean }> {
  return request("/api/delete", {
    method: "POST",
    body: JSON.stringify({ item_type: itemType, id }),
  });
}

export async function getCalendarSlots(refresh = false): Promise<CalendarSlotsResponse> {
  const query = refresh ? "?refresh=1" : "";
  const data = await request<CalendarSlotsResponse | FreeSlot[]>(
    `/api/calendar/slots${query}`,
  );
  if (Array.isArray(data)) return { slots: data };
  return {
    ...data,
    slots: data.slots ?? data.free_slots ?? [],
  };
}

export function computeStats(
  restaurants: Restaurant[],
  watchItems: WatchItem[],
): DashboardStats {
  return {
    restaurants_queued: restaurants.filter((r) => r.status === "queued").length,
    restaurants_done: restaurants.filter((r) => r.status === "done").length,
    watch_queued: watchItems.filter((w) => w.status === "queued").length,
    watch_watching: watchItems.filter((w) => w.status === "watching").length,
  };
}

export function formatSlotTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
