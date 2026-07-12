import type { ExtractedIntent } from "@brain/shared";
import type { RecentSavedItem } from "../db/conversation.js";
import {
  parseRestaurantEntities,
  parseWatchEntities,
} from "./entities.js";
import { titleMatchScore } from "./fuzzy.js";

const ENRICHMENT_PREFIX =
  /^(it'?s|its|about|a |an |the |tv\b|movie\b|show\b|documentary\b|drama\b|comedy\b)/i;

export function looksLikeWatchEnrichment(
  intent: ExtractedIntent,
  message: string,
  recentTitle: string,
): boolean {
  const e = parseWatchEntities(intent.entities);

  if (e.title) {
    const score = titleMatchScore(e.title, recentTitle);
    if (score >= 70) return true;
    if (score < 40) return false;
  }

  if (e.genre || e.type || e.platform || e.rationale) return true;

  const trimmed = message.trim();
  if (trimmed.length <= 120 && ENRICHMENT_PREFIX.test(trimmed)) return true;

  return intent.intent === "unknown" && trimmed.length <= 80;
}

export function looksLikeRestaurantEnrichment(
  intent: ExtractedIntent,
  message: string,
  recentTitle: string,
): boolean {
  const e = parseRestaurantEntities(intent.entities);

  if (e.title) {
    const score = titleMatchScore(e.title, recentTitle);
    if (score >= 70) return true;
    if (score < 40) return false;
  }

  if (e.cuisine || e.location || e.vibe) return true;

  const trimmed = message.trim();
  if (trimmed.length <= 80 && ENRICHMENT_PREFIX.test(trimmed)) return true;

  return intent.intent === "unknown" && trimmed.length <= 80;
}

export function applyEnrichmentContext(
  intent: ExtractedIntent,
  message: string,
  recentSaved: RecentSavedItem | null,
): ExtractedIntent {
  if (!recentSaved) return intent;

  const addLike = new Set(["add_watch", "add_restaurant", "unknown"]);
  if (!addLike.has(intent.intent)) return intent;

  if (recentSaved.item_type === "watch") {
    if (!looksLikeWatchEnrichment(intent, message, recentSaved.title)) {
      return intent;
    }

    const incoming = parseWatchEntities(intent.entities);
    const title =
      incoming.title && titleMatchScore(incoming.title, recentSaved.title) >= 40
        ? incoming.title
        : recentSaved.title;

    return {
      intent: "add_watch",
      entities: {
        watch: {
          title,
          type: incoming.type ?? null,
          genre: incoming.genre ?? null,
          rationale: incoming.rationale ?? null,
          runtime_min: incoming.runtime_min ?? null,
          platform: incoming.platform ?? null,
          mood_tags: incoming.mood_tags ?? null,
          notes: incoming.notes ?? null,
        },
      },
      confidence: 0.95,
      missing_fields: [],
    };
  }

  if (!looksLikeRestaurantEnrichment(intent, message, recentSaved.title)) {
    return intent;
  }

  const incoming = parseRestaurantEntities(intent.entities);
  const title =
    incoming.title && titleMatchScore(incoming.title, recentSaved.title) >= 40
      ? incoming.title
      : recentSaved.title;

  return {
    intent: "add_restaurant",
    entities: {
      restaurant: {
        title,
        cuisine: incoming.cuisine ?? null,
        location: incoming.location ?? null,
        rationale: incoming.rationale ?? null,
        vibe: incoming.vibe ?? null,
        source: incoming.source ?? null,
        notes: incoming.notes ?? null,
      },
    },
    confidence: 0.95,
    missing_fields: [],
  };
}
