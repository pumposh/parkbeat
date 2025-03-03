import { generateId } from './id';

// Model
interface MonitoredObstructionOptions {
  threshold: number;
  maxTime?: number;
}

interface MonitoredObstruction {
  id: string;
  callback: (ms: number) => void;
  options: MonitoredObstructionOptions & {
    timeElapsed: number;
  };
}

// Constants
const TIME_TO_CHECK_MAIN_THREAD = 100;

// Root level vars
const monitoredObstructions = new Map<string, MonitoredObstruction>();

let lastExecuted = performance.now();

let obstructionInterval: ReturnType<typeof setInterval> | null = null;

const callbackAndDiscardMonitor = ({ id, callback, options }: MonitoredObstruction) => {
  // Callback with the time elapsed since the last execution
  callback(Math.round(options.timeElapsed - TIME_TO_CHECK_MAIN_THREAD));

  // Delete the monitored obstruction from the map
  monitoredObstructions.delete(id);
};

const intervalExecution = () => {
  const delta = performance.now() - lastExecuted;

  monitoredObstructions.forEach(_m => {
    _m.options.timeElapsed = (_m.options.timeElapsed ?? 0) + delta;

    /**
     * If a maxTime is provided, overrides the continuous monitoring if the
     * obstruction lasts longer than maxTime
     */
    if (_m.options.maxTime && _m.options.timeElapsed > _m.options.maxTime) {
      return callbackAndDiscardMonitor(_m);
    }

    /**
     * Triggers the callback if the obstruction exceeds our threshold
     */
    if (_m.options.threshold && delta - TIME_TO_CHECK_MAIN_THREAD > _m.options.threshold) {
      return callbackAndDiscardMonitor(_m);
    }
  });

  if (obstructionInterval && monitoredObstructions.size === 0) {
    clearInterval(obstructionInterval);
    obstructionInterval = null;
    lastExecuted = 0;
  } else {
    lastExecuted = performance.now();
  }
};

const enqueueObstructionQuery = (
  callback: (ms: number) => void,
  options?: Partial<MonitoredObstruction['options']>,
  id: string = generateId()
) => {
  monitoredObstructions.set(id, {
    id,
    callback,
    options: {
      ...options,
      timeElapsed: 0,
      threshold: options?.threshold ?? 10,
    },
  });

  // If no interval is running, start one
  if (!obstructionInterval) {
    lastExecuted = performance.now();
    obstructionInterval = setInterval(() => {
      intervalExecution();
    }, TIME_TO_CHECK_MAIN_THREAD);
  }
};

/**
 * Monitors the main thread for obstructions/blocking operations by comparing the actual time elapsed
 * between intervals with the expected interval time. If the delta exceeds a threshold, it indicates
 * the main thread was blocked.
 *
 * @param callback - Function called when an obstruction is cleared, receives ms blocked as parameter
 * @param options - Configuration options
 * @param options.threshold - Minimum ms difference between actual and expected time to trigger callback (default: 10ms)
 * @param options.maxTime - Maximum total time to monitor for obstructions before auto-clearing (optional)
 * @returns An interval ID that can be used to stop monitoring via clearInterval()
 */
export const onClearedObstruction = (
  callback: (ms: number) => void,
  options?: Partial<MonitoredObstruction['options']>
) => {
  return enqueueObstructionQuery(callback, options);
};

export const asyncClearedObstruction = (options?: Partial<MonitoredObstruction['options']>) =>
  new Promise(resolve => {
    onClearedObstruction(ms => resolve(ms), options);
  });
