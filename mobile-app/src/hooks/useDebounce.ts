import { useEffect, useState } from "react";

/**
 * Returns `value`, but delayed by `delayMs` of no further changes -
 * standard debounce. Used so search-as-you-type re-scores the index on
 * pauses in typing rather than on every keystroke, without ever
 * involving the network (the index itself is fetched once, see
 * services/searchService.ts) - this purely keeps re-renders smooth on
 * lower-end devices while a student is still mid-word.
 */
export default function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
