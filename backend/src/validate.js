/**
 * Input normalisation shared by the question write routes.
 *
 * The API is the only place these fields are trusted, so normalising here keeps
 * the rules in one place instead of duplicating them per route. Both POST and
 * PUT call the same helpers, which is what stops them drifting apart.
 */

export const DIFFICULTIES = new Set(["beginner", "intermediate", "advanced"]);

export const MAX_TAGS = 6;
export const MAX_TAG_LENGTH = 40;

/**
 * Coerces `difficulty` to one of the three known levels.
 *
 * The OpenAPI schema declares this as an enum, so anything else is a client bug
 * rather than a new level. Unknown values fall back to `intermediate` instead of
 * being stored, because a stray value would reach the UI's label and colour maps
 * and render an unstyled badge.
 */
export function normaliseDifficulty(raw) {
  return DIFFICULTIES.has(raw) ? raw : "intermediate";
}

/**
 * Coerces a `difficulty` *query parameter* to one of the three levels, or null.
 *
 * This is deliberately different from `normaliseDifficulty`: that one answers
 * "what should be stored", while this answers "is this a filter I understand". An
 * unrecognised value becomes `null`, meaning no filter, rather than being
 * coerced to `intermediate` — silently showing only intermediate questions
 * because of a typo would be worse than ignoring the parameter. It matches how
 * `parsePagination` treats junk input by falling back rather than erroring.
 */
export function parseDifficultyFilter(raw) {
  return DIFFICULTIES.has(raw) ? raw : null;
}

/**
 * Normalises `answers` to a list of non-empty strings.
 *
 * Callers send either plain strings or objects carrying `answer_text`; anything
 * else (numbers, nulls, whitespace-only text) is dropped rather than stringified
 * into a meaningless answer.
 */
export function normaliseAnswers(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((entry) =>
      typeof entry === "string" ? entry : entry?.answer_text ?? null,
    )
    .filter((text) => typeof text === "string" && text.trim().length > 0)
    .map((text) => text.trim());
}

/**
 * Normalises `tags` to a deduplicated list of short, non-empty strings.
 *
 * Trimming, dropping blanks, truncating over-long tags and de-duplicating all
 * happen here so the stored JSON stays comparable to what the seed file holds.
 */
export function normaliseTags(raw) {
  if (!Array.isArray(raw)) return [];

  const seen = new Set();
  for (const tag of raw) {
    if (typeof tag !== "string") continue;
    const cleaned = tag.trim().replace(/\s+/g, "-").toLowerCase();
    if (!cleaned) continue;
    seen.add(cleaned.slice(0, MAX_TAG_LENGTH));
    if (seen.size >= MAX_TAGS) break;
  }

  return Array.from(seen);
}
