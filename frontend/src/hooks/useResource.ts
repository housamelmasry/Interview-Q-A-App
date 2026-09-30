import { useCallback, useEffect, useState } from "react";

export interface UseResource<T> {
  data: T;
  loading: boolean;
  error: string | null;
  /** Re-runs the request, e.g. from the error banner's retry button. */
  reload: () => void;
  clearError: () => void;
}

/** Turns a rejection into banner text; `ApiError` messages come from the API. */
export const describeError = (cause: unknown): string =>
  cause instanceof Error ? cause.message : "Failed to load data. Is the API running?";

/**
 * Loads a single resource on mount and whenever `reload` is called.
 *
 * The in-flight request is aborted on cleanup, and results are only committed
 * while the effect is still the current one, so a slow response can never
 * overwrite a newer one.
 */
export function useResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  initial: T,
): UseResource<T> {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    // A fetch hook cannot render "loading" any earlier than the effect that
    // starts the request, so this is the one place the reset is unavoidable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    load(controller.signal)
      .then((next) => {
        if (active) setData(next);
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
  }, [load, revision]);

  const reload = useCallback(() => setRevision((current) => current + 1), []);
  const clearError = useCallback(() => setError(null), []);

  return { data, loading, error, reload, clearError };
}
