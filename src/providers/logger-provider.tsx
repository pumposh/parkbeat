'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { getLogger, ParkbeatLogger } from '@/lib/logger';

// Define the context type
type LoggerContextType = {
  logger: ParkbeatLogger.Logger;
  isEnabled: boolean;
  logLevel: ParkbeatLogger.LogLevel;
  setEnabled: (enabled: boolean) => void;
  setLogLevel: (level: ParkbeatLogger.LogLevel) => void;
};

// Create the context with default values
const LoggerContext = createContext<LoggerContextType>({
  logger: getLogger(),
  isEnabled: true,
  logLevel: 'debug',
  setEnabled: () => {},
  setLogLevel: () => {},
});

// Custom hook to use the logger context
export const useLoggerContext = () => useContext(LoggerContext);

type LoggerProviderProps = {
  children: React.ReactNode;
  overrideConsole?: boolean;
  defaultLogLevel?: ParkbeatLogger.LogLevel;
  defaultEnabled?: boolean;
};

/**
 * Provider component that initializes the logger and makes it available throughout the app
 */
export function LoggerProvider({
  children,
  overrideConsole = true,
  defaultLogLevel = 'debug',
  defaultEnabled = process.env.NODE_ENV !== 'production',
}: LoggerProviderProps) {
  // Get the logger instance but don't override console immediately
  // This prevents recursive logging during initialization
  const logger = React.useMemo(() => getLogger(false), []);
  
  // Initialize state
  const [isEnabled, setIsEnabled] = useState(defaultEnabled);
  const [logLevel, setLogLevel] = useState<ParkbeatLogger.LogLevel>(defaultLogLevel);

  // Initialize the logger on mount
  useEffect(() => {
    // Set initial state
    logger.setEnabled(isEnabled);
    logger.setLogLevel(logLevel);
    
    // Log initialization using direct console methods to avoid recursion
    const originalConsole = {
      log: window.console.log.bind(console),
      info: window.console.info.bind(console),
      warn: window.console.warn.bind(console),
      error: window.console.error.bind(console),
      debug: window.console.debug?.bind(console) || window.console.log.bind(console),
    };
    
    originalConsole.info('[Logger] Logger initialized');
    originalConsole.info('[Logger] App version:', process.env.NEXT_PUBLIC_APP_VERSION || 'unknown');
    originalConsole.info('[Logger] Environment:', process.env.NODE_ENV);
    
    if (typeof window !== 'undefined') {
      originalConsole.info('[Logger] User agent:', navigator.userAgent);
      
      // Add a global window property for debugging
      (window as any).__logger = {
        instance: logger,
        enable: () => logger.setEnabled(true),
        disable: () => logger.setEnabled(false),
        setLevel: (level: ParkbeatLogger.LogLevel) => logger.setLogLevel(level),
      };
    }
    
    // Only override console after initialization if requested
    if (overrideConsole) {
      // Small delay to ensure initialization logs are complete
      setTimeout(() => {
        // Call a method that will trigger the console override
        // We need to do this because we initialized with overrideConsole=false
        logger.setEnabled(isEnabled);
        
        // Force override console methods
        (logger as any).overrideConsoleMethods?.();
        
        originalConsole.info('[Logger] Console methods overridden');
      }, 100);
    }
    
    // Clean up on unmount
    return () => {
      logger.destroy();
    };
  }, []);
  
  // Update logger when state changes
  useEffect(() => {
    logger.setEnabled(isEnabled);
  }, [isEnabled, logger]);
  
  useEffect(() => {
    logger.setLogLevel(logLevel);
  }, [logLevel, logger]);
  
  // Provide the context value
  const contextValue = {
    logger,
    isEnabled,
    logLevel,
    setEnabled: (enabled: boolean) => {
      setIsEnabled(enabled);
    },
    setLogLevel: (level: ParkbeatLogger.LogLevel) => {
      setLogLevel(level);
    },
  };
  
  return (
    <LoggerContext.Provider value={contextValue}>
      {children}
    </LoggerContext.Provider>
  );
} 