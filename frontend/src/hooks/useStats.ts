import { fetchStats } from "../api/client";
import type { Stats } from "../api/types";
import { useResource } from "./useResource";

const EMPTY_STATS: Stats = {
  total_categories: 0,
  total_questions: 0,
  total_answers: 0,
  categories: [],
};

/** Site-wide totals from `/api/stats`, used by the header summary. */
export function useStats() {
  return useResource<Stats>(fetchStats, EMPTY_STATS);
}
