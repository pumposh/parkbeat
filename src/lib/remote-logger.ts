/**
 * Remote Logger
 * 
 * This utility captures console logs and sends them to a browser-based console.
 * Useful for debugging mobile applications in simulators where console access is limited.
 */

type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
type LogEntry = {
  timestamp: number;
  level: LogLevel;
  message: string;
  data: any[];
};

// Define console method types
type ConsoleMethod = (...data: any[]) => void;

class RemoteLogger {
  private static instance: RemoteLogger;
  private serverUrl: string | null = null;
  private isEnabled: boolean = false;
  private buffer: LogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private originalConsole: Record<LogLevel, ConsoleMethod> = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console)
  };

  private constructor() {}

  public static getInstance(): RemoteLogger {
    if (!RemoteLogger.instance) {
      RemoteLogger.instance = new RemoteLogger();
    }
    return RemoteLogger.instance;
  }

  /**
   * Initialize the remote logger
   * @param serverUrl The URL of the remote logging server
   * @param flushIntervalMs How often to send logs to the server (in milliseconds)
   */
  public init(serverUrl: string, flushIntervalMs: number = 1000): void {
    this.serverUrl = serverUrl;
    this.isEnabled = true;
    
    // Override console methods
    console.log = this.createLogFunction('log') as ConsoleMethod;
    console.info = this.createLogFunction('info') as ConsoleMethod;
    console.warn = this.createLogFunction('warn') as ConsoleMethod;
    console.error = this.createLogFunction('error') as ConsoleMethod;
    console.debug = this.createLogFunction('debug') as ConsoleMethod;
    
    // Set up flush interval
    this.flushInterval = setInterval(() => this.flush(), flushIntervalMs);
    
    // Log initialization
    console.info('[RemoteLogger] Initialized remote logging');
  }

  /**
   * Disable remote logging and restore original console methods
   */
  public disable(): void {
    this.isEnabled = false;
    
    // Restore original console methods
    console.log = this.originalConsole.log;
    console.info = this.originalConsole.info;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
    console.debug = this.originalConsole.debug;
    
    // Clear flush interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    
    // Clear buffer
    this.buffer = [];
  }

  /**
   * Create a function that logs to both the original console and the remote logger
   */
  private createLogFunction(level: LogLevel): ConsoleMethod {
    const originalFn = this.originalConsole[level];
    
    return (...args: any[]) => {
      // Call original console method
      originalFn(...args);
      
      // Add to buffer if enabled
      if (this.isEnabled) {
        const message = args[0]?.toString() || '';
        const data = args.slice(1);
        
        this.buffer.push({
          timestamp: Date.now(),
          level,
          message,
          data
        });
      }
    };
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
      body: JSON.stringify({
        logs,
        device: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          timestamp: Date.now()
        }
      }),
    }).catch(err => {
      // If sending fails, log to original console and add back to buffer
      this.originalConsole.error('[RemoteLogger] Failed to send logs:', err);
      this.buffer = [...logs, ...this.buffer];
    });
  }
}

export const remoteLogger = RemoteLogger.getInstance(); 