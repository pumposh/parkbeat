/**
 * Remote Logger Plugin
 * 
 * This utility captures logs from the Logger class and sends them to a remote server.
 * Useful for debugging mobile applications in simulators where console access is limited.
 */

import { LoggerPlugin, LogLevel, getLogger } from './logger';

type LogEntry = {
  timestamp: number;
  level: LogLevel;
  message: string;
  data: any[];
};

/**
 * Safe stringify function that handles circular references
 */
function safeStringify(obj: any): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    // Handle DOM nodes and other non-serializable objects
    if (typeof value === 'object' && value !== null) {
      // Check for circular reference
      if (seen.has(value)) {
        return '[Circular Reference]';
      }
      
      // Handle DOM nodes
      if (value instanceof Node) {
        return `[${value.nodeName}]`;
      }
      
      // Handle other special objects
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack
        };
      }
      
      // Add object to seen set
      seen.add(value);
    }
    
    // Handle functions
    if (typeof value === 'function') {
      return '[Function]';
    }
    
    return value;
  });
}

/**
 * RemoteLoggerPlugin captures logs and sends them to a remote server
 */
export class RemoteLoggerPlugin implements LoggerPlugin {
  private static instance: RemoteLoggerPlugin;
  public readonly name = 'RemoteLogger';
  private serverUrl: string | null = null;
  private isEnabled: boolean = false;
  private buffer: LogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private flushIntervalMs: number = 1000;

  private constructor() {}

  public static getInstance(): RemoteLoggerPlugin {
    if (!RemoteLoggerPlugin.instance) {
      RemoteLoggerPlugin.instance = new RemoteLoggerPlugin();
    }
    return RemoteLoggerPlugin.instance;
  }

  /**
   * Initialize the remote logger plugin
   * @param serverUrl The URL of the remote logging server
   * @param flushIntervalMs How often to send logs to the server (in milliseconds)
   */
  public init(serverUrl: string, flushIntervalMs: number = 1000): RemoteLoggerPlugin {
    this.serverUrl = serverUrl;
    this.flushIntervalMs = flushIntervalMs;
    this.isEnabled = true;
    
    // Register with the logger
    getLogger().registerPlugin(this);
    
    return this;
  }

  /**
   * Called when the plugin is initialized by the logger
   */
  public onInit(): void {
    // Set up flush interval
    if (this.isEnabled && !this.flushInterval) {
      this.flushInterval = setInterval(() => this.flush(), this.flushIntervalMs);
      console.info('[RemoteLogger] Initialized remote logging');
    }
  }

  /**
   * Called when the plugin is disabled by the logger
   */
  public onDisable(): void {
    this.isEnabled = false;
    
    // Clear flush interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    
    // Clear buffer
    this.buffer = [];
  }

  /**
   * Called for each log message
   */
  public onLog(level: LogLevel, message: string, ...data: any[]): void {
    if (!this.isEnabled) return;
    
    this.buffer.push({
      timestamp: Date.now(),
      level,
      message,
      data
    });
  }

  /**
   * Manually disable the plugin
   */
  public disable(): void {
    if (this.isEnabled) {
      this.isEnabled = false;
      getLogger().unregisterPlugin(this.name);
    }
  }

  /**
   * Send buffered logs to the remote server
   */
  private flush(): void {
    if (!this.isEnabled || !this.serverUrl || this.buffer.length === 0) {
      return;
    }

    const logs = [...this.buffer];
    this.buffer = [];

    // Send logs to server
    fetch(this.serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: safeStringify({
        logs,
        device: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          timestamp: Date.now()
        }
      }),
    }).catch(err => {
      // If sending fails, log to original console and add back to buffer
      console.warn('[RemoteLogger] Failed to send logs:', err);
      this.buffer = [...logs, ...this.buffer];
    });
  }
  
  /**
   * Manually flush logs
   */
  public manualFlush(): void {
    this.flush();
  }
}

// Create a convenience function for getting the remote logger instance
export const remoteLogger = RemoteLoggerPlugin.getInstance(); 