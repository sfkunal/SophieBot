import type { Vibe, WatchType } from "@brain/shared";

type EntityRecord = Record<string, unknown>;

function asRecord(v: unknown): EntityRecord | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as EntityRecord)
    : null;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && !Number.isNaN(v) ? v : undefined;
}

export interface ParsedRestaurantEntities {
  title?: string;
  cuisine?: string;
  location?: string;
  rationale?: string;
  vibe?: Vibe;
  source?: string;
  notes?: string;
  filter_cuisine?: string;
  filter_location?: string;
  filter_vibe?: string;
}

export interface ParsedWatchEntities {
  title?: string;
  type?: WatchType;
  genre?: string;
  rationale?: string;
  runtime_min?: number;
  platform?: string;
  mood_tags?: string;
  notes?: string;
  filter_genre?: string;
  filter_mood?: string;
  filter_runtime_max?: number;
  item_type?: "restaurant" | "watch";
}

export interface ParsedCalendarEntities {
  date?: string;
  time_range?: string;
  min_duration_minutes?: number;
}

export function parseRestaurantEntities(
  entities: Record<string, unknown>,
): ParsedRestaurantEntities {
  const restaurant = asRecord(entities.restaurant);
  const filters = asRecord(entities.filters);
  const flat = asRecord(entities) ?? {};

  const vibeRaw =
    str(restaurant?.vibe) ?? str(flat.vibe) ?? str(filters?.vibe);

  return {
    title: str(restaurant?.title) ?? str(flat.title),
    cuisine:
      str(restaurant?.cuisine) ??
      str(flat.cuisine) ??
      str(filters?.cuisine),
    location:
      str(restaurant?.location) ??
      str(flat.location) ??
      str(filters?.location),
    rationale: str(restaurant?.rationale) ?? str(flat.rationale),
    vibe: vibeRaw as Vibe | undefined,
    source: str(restaurant?.source) ?? str(flat.source),
    notes: str(restaurant?.notes) ?? str(flat.notes),
    filter_cuisine: str(filters?.cuisine) ?? str(flat.filter_cuisine),
    filter_location: str(filters?.location) ?? str(flat.filter_location),
    filter_vibe: str(filters?.vibe) ?? str(flat.filter_vibe),
  };
}

export function parseWatchEntities(
  entities: Record<string, unknown>,
): ParsedWatchEntities {
  const watch = asRecord(entities.watch);
  const item = asRecord(entities.item);
  const filters = asRecord(entities.filters);
  const flat = asRecord(entities) ?? {};

  const typeRaw =
    str(watch?.type) ?? str(flat.type) ?? str(filters?.type);

  return {
    title:
      str(watch?.title) ??
      str(item?.title) ??
      str(flat.title),
    type: typeRaw as WatchType | undefined,
    genre: str(watch?.genre) ?? str(flat.genre) ?? str(filters?.genre),
    rationale: str(watch?.rationale) ?? str(flat.rationale),
    runtime_min:
      num(watch?.runtime_min) ??
      num(flat.runtime_min) ??
      num(filters?.max_runtime_min),
    platform: str(watch?.platform) ?? str(flat.platform),
    mood_tags:
      str(watch?.mood_tags) ??
      str(flat.mood_tags) ??
      str(filters?.mood),
    notes: str(watch?.notes) ?? str(flat.notes),
    filter_genre: str(filters?.genre) ?? str(flat.filter_genre),
    filter_mood: str(filters?.mood) ?? str(flat.filter_mood),
    filter_runtime_max:
      num(filters?.max_runtime_min) ?? num(flat.filter_runtime_max),
    item_type:
      (str(item?.item_type) ?? str(flat.item_type)) as
        | "restaurant"
        | "watch"
        | undefined,
  };
}

export function parseCalendarEntities(
  entities: Record<string, unknown>,
): ParsedCalendarEntities {
  const calendar = asRecord(entities.calendar);
  const flat = asRecord(entities) ?? {};

  return {
    date: str(calendar?.date) ?? str(flat.date),
    time_range: str(calendar?.time_range) ?? str(flat.time_range),
    min_duration_minutes:
      num(calendar?.min_duration_min) ??
      num(calendar?.min_duration_minutes) ??
      num(flat.min_duration_minutes),
  };
}

export function parseVoteTitle(entities: Record<string, unknown>): {
  title?: string;
  item_type?: "restaurant" | "watch";
} {
  const item = asRecord(entities.item);
  const flat = asRecord(entities) ?? {};
  return {
    title: str(item?.title) ?? str(flat.title),
    item_type: (str(item?.item_type) ?? str(flat.item_type)) as
      | "restaurant"
      | "watch"
      | undefined,
  };
}
