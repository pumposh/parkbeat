'use client';

import { useRemoteLoggerContext } from '@/providers/remote-logger-provider';
import { useState } from 'react';

/**
 * A simple UI component to control the remote logger in development mode.
 * This component will only be rendered in development mode.
 */
export function RemoteLoggerControl() {
  const { isEnabled, enableLogging, disableLogging } = useRemoteLoggerContext();
  const [serverUrl, setServerUrl] = useState('http://localhost:3030/logs');
  const [isExpanded, setIsExpanded] = useState(false);

  // Only render in development mode
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed bottom-20 right-4 z-50">
      <div className="flex flex-col items-end gap-2">
        {isExpanded && (
          <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg text-sm">
            <div className="mb-2">
              <label className="block text-gray-700 dark:text-gray-300 mb-1">
                Server URL:
              </label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                className="w-full px-2 py-1 border rounded text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => enableLogging(serverUrl)}
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
                onClick={disableLogging}
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
          className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-full shadow-lg"
          title="Remote Logger Controls"
        >
          <i className="fa-solid fa-bug"></i>
        </button>
      </div>
    </div>
  );
} 