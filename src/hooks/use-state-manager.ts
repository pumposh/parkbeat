import { useEffect, useState } from 'react';
import { StateManager } from '../lib/state-manager';

/**
 * React hook for using a StateManager instance
 * @param id - Unique identifier for the state manager
 * @param initialState - Initial state value
 * @param options - Configuration options
 * @returns [state, setState, manager] tuple
 */
export function useStateManager<T>(
  id: string,
  initialState: T,
  options: {
    persistence?: boolean;
    persistenceKey?: string;
  } = {}
): [T, (updater: T | ((prevState: T) => T)) => void, StateManager<T>] {
  // Get or create the state manager instance
  const manager = StateManager.getInstance<T>(id, initialState, options);
  
  // Local state to trigger re-renders
  const [state, setState] = useState<T>(manager.getState());

  useEffect(() => {
    // Subscribe to state changes
    const listenerId = manager.subscribe((newState) => {
      setState(newState);
    });

    // Unsubscribe when the component unmounts
    return () => {
      manager.unsubscribe(listenerId);
    };
  }, [manager]);

  // Return the state, a setter function, and the manager instance
  return [
    state,
    (updater: T | ((prevState: T) => T)) => manager.setState(updater),
    manager
  ];
}

/**
 * React hook for subscribing to a StateManager instance without managing state
 * @param id - Unique identifier for the state manager
 * @param initialState - Initial state value
 * @param options - Configuration options
 * @returns StateManager instance
 */
export function useStateManagerInstance<T>(
  id: string,
  initialState: T,
  options: {
    persistence?: boolean;
    persistenceKey?: string;
  } = {}
): StateManager<T> {
  // Get or create the state manager instance
  const manager = StateManager.getInstance<T>(id, initialState, options);
  
  return manager;
}

/**
 * React hook for subscribing to a specific StateManager instance
 * @param manager - StateManager instance to subscribe to
 * @returns [state, setState] tuple
 */
export function useStateManagerSubscription<T>(
  manager: StateManager<T>
): [T, (updater: T | ((prevState: T) => T)) => void] {
  // Local state to trigger re-renders
  const [state, setState] = useState<T>(manager.getState());

  useEffect(() => {
    // Subscribe to state changes
    const listenerId = manager.subscribe((newState) => {
      setState(newState);
    });

    // Unsubscribe when the component unmounts
    return () => {
      manager.unsubscribe(listenerId);
    };
  }, [manager]);

  // Return the state and a setter function
  return [
    state,
    (updater: T | ((prevState: T) => T)) => manager.setState(updater)
  ];
} 