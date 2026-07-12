import { z } from "zod";

export const intentSchema = z.enum([
  "add_restaurant",
  "add_watch",
  "list_restaurants",
  "list_watch",
  "suggest_restaurant",
  "suggest_watch",
  "mark_done",
  "vote",
  "calendar_free",
  "calendar_next_slot",
  "calendar_summary",
  "help",
  "unknown",
]);

export const restaurantEntitiesSchema = z.object({
  title: z.string().optional(),
  cuisine: z.string().optional(),
  location: z.string().optional(),
  rationale: z.string().optional(),
  vibe: z.enum(["casual", "date_night", "special_occasion", "quick_bite"]).optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  filter_cuisine: z.string().optional(),
  filter_location: z.string().optional(),
  filter_vibe: z.string().optional(),
});

export const watchEntitiesSchema = z.object({
  title: z.string().optional(),
  type: z.enum(["tv", "movie"]).optional(),
  genre: z.string().optional(),
  rationale: z.string().optional(),
  runtime_min: z.number().optional(),
  platform: z.string().optional(),
  mood_tags: z.string().optional(),
  notes: z.string().optional(),
  filter_genre: z.string().optional(),
  filter_mood: z.string().optional(),
  filter_runtime_max: z.number().optional(),
  item_type: z.enum(["restaurant", "watch"]).optional(),
});

export const calendarEntitiesSchema = z.object({
  date: z.string().optional(),
  time_range: z.string().optional(),
  min_duration_minutes: z.number().optional(),
});

export const extractedIntentSchema = z.object({
  intent: intentSchema,
  entities: z.record(z.unknown()),
  confidence: z.number().min(0).max(1),
  missing_fields: z.array(z.string()).default([]),
});

export const phoneVerifyRequestSchema = z.object({
  phone: z.string().min(10),
});

export const phoneVerifyConfirmSchema = z.object({
  phone: z.string().min(10),
  code: z.string().length(6),
});

export const markDoneRequestSchema = z.object({
  item_type: z.enum(["restaurant", "watch"]),
  id: z.string(),
});

export const deleteItemRequestSchema = markDoneRequestSchema;

export type ExtractedIntentPayload = z.infer<typeof extractedIntentSchema>;
/** @deprecated alias — use ExtractedIntentPayload */
export type IntentExtraction = ExtractedIntentPayload;
