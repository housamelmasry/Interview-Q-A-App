import type { Difficulty } from "./api/types";

/** Category selected on a cold start; the first one wins if it is gone. */
export const DEFAULT_CATEGORY_ID = "laravel-core";

/** Questions requested per page, mirrored in the `limit` query parameter. */
export const PAGE_SIZE = 10;

/** Idle time before a keystroke turns into a search request. */
export const SEARCH_DEBOUNCE_MS = 300;

export const DIFFICULTY_LEVELS: readonly Difficulty[] = [
  "beginner",
  "intermediate",
  "advanced",
];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner: "مبتدئ",
  intermediate: "متوسط",
  advanced: "متقدم",
};

export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  beginner: "#2ecc71",
  intermediate: "#f39c12",
  advanced: "#e74c3c",
};
