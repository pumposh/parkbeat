'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { remoteLogger } from '@/lib/remote-logger';

// Define the context type
type RemoteLoggerContextType = {
  isEnabled: boolean;
  enableLogging: (serverUrl?: string) => void;
  disableLogging: () => void;
};

// Create the context with default values
const RemoteLoggerContext = createContext<RemoteLoggerContextType>({
  isEnabled: false,
  enableLogging: () => {},
  disableLogging: () => {},
});

// Custom hook to use the remote logger context
export const useRemoteLoggerContext = () => useContext(RemoteLoggerContext);

type RemoteLoggerProviderProps = {
  children: React.ReactNode;
  defaultServerUrl?: string;
  autoEnable?: boolean;
  flushIntervalMs?: number;
};

/**
 * Provider component that makes remote logging available throughout the app
 */
export function RemoteLoggerProvider({
  children,
  defaultServerUrl = 'http://localhost:3030/logs',
  autoEnable = process.env.NODE_ENV === 'development' || true, // Need this rn
  flushIntervalMs = 1000,
}: RemoteLoggerProviderProps) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [serverUrl, setServerUrl] = useState(defaultServerUrl);

  // Function to enable logging
  const enableLogging = (url?: string) => {
    const logServerUrl = url || serverUrl;
    setServerUrl(logServerUrl);
    remoteLogger.init(logServerUrl, flushIntervalMs);
    setIsEnabled(true);
    
    // Log some initial information
    console.info('[RemoteLogger] Remote logging initialized');
    console.info('[RemoteLogger] App version:', process.env.NEXT_PUBLIC_APP_VERSION || 'unknown');
    console.info('[RemoteLogger] Environment:', process.env.NODE_ENV);
    console.info('[RemoteLogger] User agent:', navigator.userAgent);
  };

  // Function to disable logging
  const disableLogging = () => {
    remoteLogger.disable();
    setIsEnabled(false);
  };

  // Auto-enable logging if configured
  useEffect(() => {
    // Only auto-enable in development mode and if autoEnable is true
    if (
      autoEnable
      // && process.env.NODE_ENV === 'development' // Need this rn
    ) {
      enableLogging();
      
      // Add a global window property for debugging
      if (typeof window !== 'undefined') {
        (window as any).__remoteLogger = {
          enable: enableLogging,
          disable: disableLogging,
        };
      }
    }

    // Clean up on unmount
    return () => {
      if (isEnabled) {
        disableLogging();
      }
    };
  }, [autoEnable]);

  // Provide the context value
  const contextValue = {
    isEnabled,
    enableLogging,
    disableLogging,
  };

  return (
    <RemoteLoggerContext.Provider value={contextValue}>
      {children}
    </RemoteLoggerContext.Provider>
  );
} 