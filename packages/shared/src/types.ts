export type ItemStatus = "queued" | "watching" | "done" | "dropped";
export type RestaurantStatus = "queued" | "done" | "dropped";
export type Vibe = "casual" | "date_night" | "special_occasion" | "quick_bite";
export type WatchType = "tv" | "movie";

export type MessageChannel = "sms" | "telegram";

export interface User {
  id: string;
  phone_e164: string;
  name: string | null;
  google_refresh_token: string | null;
  prefs_json: string | null;
  telegram_chat_id: string | null;
  telegram_user_id: string | null;
  created_at: string;
}

export interface Restaurant {
  id: string;
  title: string;
  cuisine: string | null;
  location: string | null;
  rationale: string | null;
  vibe: Vibe | null;
  source: string | null;
  notes: string | null;
  priority: number;
  status: RestaurantStatus;
  added_by: string | null;
  added_at: string;
  completed_at: string | null;
}

export interface WatchItem {
  id: string;
  title: string;
  type: WatchType | null;
  genre: string | null;
  rationale: string | null;
  runtime_min: number | null;
  platform: string | null;
  mood_tags: string | null;
  notes: string | null;
  priority: number;
  status: ItemStatus;
  added_by: string | null;
  added_at: string;
  completed_at: string | null;
}

export interface Vote {
  id: string;
  item_type: "restaurant" | "watch";
  item_id: string;
  user_id: string;
  value: number;
  created_at: string;
}

export interface InboundMessage {
  id: string;
  from_phone: string;
  channel: MessageChannel;
  body: string;
  parsed_intent_json: string | null;
  reply_body: string | null;
  created_at: string;
}

export interface CalendarBusyBlock {
  user_id: string;
  start: string;
  end: string;
  summary: string | null;
}

export interface FreeSlot {
  start: string;
  end: string;
  duration_minutes: number;
}

export type Intent =
  | "add_restaurant"
  | "add_watch"
  | "list_restaurants"
  | "list_watch"
  | "suggest_restaurant"
  | "suggest_watch"
  | "mark_done"
  | "vote"
  | "calendar_free"
  | "calendar_next_slot"
  | "calendar_summary"
  | "help"
  | "unknown";

export interface ExtractedIntent {
  intent: Intent;
  entities: Record<string, unknown>;
  confidence: number;
  missing_fields: string[];
}

export interface HandlerResult {
  data: Record<string, unknown>;
  followUpQuestion?: string;
}

export interface ReplyContext {
  intent: ExtractedIntent;
  handlerResult: HandlerResult;
  senderName?: string;
  restaurantCount?: number;
  watchCount?: number;
  freeSlots?: FreeSlot[];
}
