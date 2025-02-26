import { useEffect } from 'react';
import { remoteLogger } from '@/lib/remote-logger';

/**
 * Hook to initialize and use the remote logger
 * 
 * @param serverUrl The URL of the remote logging server
 * @param options Configuration options
 * @returns void
 * 
 * @example
 * // In your component or app entry point:
 * useRemoteLogger('http://localhost:3030/logs');
 * 
 * // Then use console.log, console.info, etc. as normal
 * console.log('This will be sent to the remote logger');
 */
export function useRemoteLogger(
  serverUrl: string,
  options: {
    enabled?: boolean;
    flushIntervalMs?: number;
  } = {}
) {
  const { enabled = true, flushIntervalMs = 1000 } = options;

  useEffect(() => {
    if (enabled) {
      // Initialize remote logger
      remoteLogger.init(serverUrl, flushIntervalMs);
      
      // Log some initial information
      console.info('[RemoteLogger] Remote logging initialized');
      console.info('[RemoteLogger] App version:', process.env.NEXT_PUBLIC_APP_VERSION || 'unknown');
      console.info('[RemoteLogger] Environment:', process.env.NODE_ENV);
      
      // Clean up on unmount
      return () => {
        remoteLogger.disable();
      };
    }
  }, [serverUrl, enabled, flushIntervalMs]);
} 