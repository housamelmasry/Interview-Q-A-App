import { useEffect, useState } from "react";

import { SEARCH_DEBOUNCE_MS } from "../constants";

/**
 * Returns `value` once it has stopped changing for `delay` milliseconds.
 *
 * Used to keep typing out of the request path: the search box stays controlled
 * and responsive while the list only refetches when the user pauses.
 */
export function useDebounce<T>(value: T, delay = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
