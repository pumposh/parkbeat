import { useEffect } from "react";

import { useState } from "react";


/**
 * Delays the memoization of a value by a given delay.
 * Useful for timing animation dependent on a value.
 */
const useDelayedMemo = <T>(fn: () => T, deps: any[], delay: number) => {
  const [delayedValue, setDelayedValue] = useState<T>(fn());

  useEffect(() => {
    const timeout = setTimeout(() => setDelayedValue(fn()), delay);
    return () => clearTimeout(timeout);
  }, [fn, delay, ...deps]);

  return delayedValue;
};

export default useDelayedMemo;
