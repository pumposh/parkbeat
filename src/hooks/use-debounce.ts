import { useState, useEffect, useRef } from 'react'

/**
 * A hook that returns a debounced version of the provided value.
 * The debounced value will only update after the specified delay has passed
 * without any new updates to the original value.
 * 
 * @param value The value to debounce
 * @param delay The delay in milliseconds
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}

/**
 * Extends Function with a flush helper method to immediately execute
 * any pending debounced calls.
 */
export interface DebouncableFunction extends Function {
  flush?: () => void;
}


/**
 * A hook that returns a debounced version of the provided function.
 * The function will only be called after the specified delay has passed
 * without any new invocations.
 * 
 * @param fn The function to debounce
 * @param delay The delay in milliseconds
 * @param deps Dependencies array that will trigger a new debounced function when changed
 * @returns A debounced version of the provided function
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
  deps: React.DependencyList = []
): DebouncableFunction {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Use useRef for mutable variables that we want to persist
  // without triggering a re-render on their change
  const fnRef = useRef<T>(fn)

  const lastArgsRef = useRef<Parameters<T> | null>(null)
  
  // Update the function ref whenever fn changes
  useEffect(() => {
    fnRef.current = fn
  }, [fn, ...deps])
  
  const debouncedFn = (...args: Parameters<T>) => {
    // Clear the previous timeout
    if (timeoutRef.current) {
      lastArgsRef.current = null
      clearTimeout(timeoutRef.current)
    }
    
    // Set a new timeout
    lastArgsRef.current = args
    timeoutRef.current = setTimeout(() => {
      fnRef.current(...args)
    }, delay)
  }

  // Add flush method to the debounced function
  debouncedFn.flush = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      fnRef.current(...(lastArgsRef.current ?? []))
      lastArgsRef.current = null
    }
  }

  return debouncedFn
} 