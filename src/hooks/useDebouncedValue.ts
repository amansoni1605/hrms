'use client';

import { useEffect, useState } from 'react';

/**
 * useDebouncedValue — returns a value that updates only after the input has
 * been stable for `delay` milliseconds.  Used to throttle search inputs.
 *
 * @example
 *   const [search, setSearch] = useState('');
 *   const debounced = useDebouncedValue(search, 250);
 *   useEffect(() => { fetchResults(debounced); }, [debounced]);
 */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
