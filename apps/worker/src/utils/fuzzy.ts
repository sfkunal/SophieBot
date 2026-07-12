/** Normalize for fuzzy title matching. */
export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Score how well `query` matches `candidate` (higher = better). */
export function titleMatchScore(query: string, candidate: string): number {
  const q = normalizeTitle(query);
  const c = normalizeTitle(candidate);
  if (!q || !c) return 0;
  if (c === q) return 100;
  if (c.includes(q)) return 80;
  if (q.includes(c)) return 70;

  const qWords = q.split(" ").filter(Boolean);
  const cWords = new Set(c.split(" ").filter(Boolean));
  const overlap = qWords.filter((w) => cWords.has(w)).length;
  if (overlap === 0) return 0;
  return Math.round((overlap / qWords.length) * 60);
}

export function bestTitleMatch<T extends { title: string }>(
  query: string,
  items: T[],
): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const item of items) {
    const score = titleMatchScore(query, item.title);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return bestScore >= 40 ? best : null;
}
