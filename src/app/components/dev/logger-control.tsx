'use client';

import { useLoggerContext } from '@/providers/logger-provider';
import { useState } from 'react';
import { ParkbeatLogger } from '@/lib/logger';

/**
 * A simple UI component to control the logger in development mode.
 * This component will only be rendered in development mode.
 */
export function LoggerControl() {
  const { isEnabled, logLevel, setEnabled, setLogLevel } = useLoggerContext();
  const [isExpanded, setIsExpanded] = useState(false);

  // Only render in development mode
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const logLevels: ParkbeatLogger.LogLevel[] = ['debug', 'info', 'warn', 'error'];

  return (
    <div className="fixed bottom-20 left-4 z-50">
      <div className="flex flex-col items-start gap-2">
        {isExpanded && (
          <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg text-sm">
            <div className="mb-2">
              <label className="block text-gray-700 dark:text-gray-300 mb-1">
                Log Level:
              </label>
              <select
                value={logLevel}
                onChange={(e) => setLogLevel(e.target.value as ParkbeatLogger.LogLevel)}
                className="w-full px-2 py-1 border rounded text-sm"
              >
                {logLevels.map((level) => (
                  <option key={level} value={level}>
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEnabled(true)}
                disabled={isEnabled}
                className={`px-3 py-1 rounded text-white text-xs ${
                  isEnabled
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-green-500 hover:bg-green-600'
                }`}
              >
                Enable
              </button>
              <button
                onClick={() => setEnabled(false)}
                disabled={!isEnabled}
                className={`px-3 py-1 rounded text-white text-xs ${
                  !isEnabled
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                Disable
              </button>
            </div>
          </div>
        )}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="bg-purple-500 hover:bg-purple-600 text-white p-2 rounded-full shadow-lg"
          title="Logger Controls"
        >
          <i className="fa-solid fa-terminal"></i>
        </button>
      </div>
    </div>
  );
} 