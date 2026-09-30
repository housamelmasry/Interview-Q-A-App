import { useCallback, useEffect, useState } from "react";

import { fetchQuestions, searchQuestions } from "../api/client";
import type { PaginatedResponse, Question } from "../api/types";
import { PAGE_SIZE } from "../constants";
import { describeError } from "./useResource";

export interface UseQuestionsParams {
  category: string;
  /** Already debounced by the caller. */
  searchTerm: string;
  page: number;
  limit?: number;
  /** Holds the request back while the active category is still unknown. */
  enabled?: boolean;
}

export interface UseQuestionsResult extends PaginatedResponse<Question> {
  loading: boolean;
  error: string | null;
  reload: () => void;
  clearError: () => void;
}

const EMPTY_PAGE: PaginatedResponse<Question> = {
  items: [],
  total: 0,
  page: 1,
  limit: PAGE_SIZE,
  pages: 1,
};

/**
 * The one hook that reads questions.
 *
 * A non-empty `searchTerm` switches the endpoint to `/api/search`, which spans
 * every category; otherwise the current `category` filter is applied server
 * side. The response envelope is exposed as-is so the pagination controls can
 * be driven by `total`/`pages` without a second request.
 */
export function useQuestions({
  category,
  searchTerm,
  page,
  limit = PAGE_SIZE,
  enabled = true,
}: UseQuestionsParams): UseQuestionsResult {
  const [data, setData] = useState<PaginatedResponse<Question>>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const term = searchTerm.trim();

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    let active = true;

    // A fetch hook cannot render "loading" any earlier than the effect that
    // starts the request, so this is the one place the reset is unavoidable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const request = term
      ? searchQuestions({ term, page, limit, signal: controller.signal })
      : fetchQuestions({ category, page, limit, signal: controller.signal });

    request
      .then((response) => {
        if (active) setData(response);
      })
      .catch((cause: unknown) => {
        if (!active || controller.signal.aborted) return;
        setError(describeError(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [category, term, page, limit, enabled, revision]);

  const reload = useCallback(() => setRevision((current) => current + 1), []);
  const clearError = useCallback(() => setError(null), []);

  // `page`/`limit` echo the request rather than the response: the controls have
  // to react to the click immediately, not when the next page lands. Holding the
  // request back is derived the same way, so it costs no extra render.
  return {
    ...(enabled ? data : EMPTY_PAGE),
    page,
    limit,
    loading: enabled && loading,
    error: enabled ? error : null,
    reload,
    clearError,
  };
}
