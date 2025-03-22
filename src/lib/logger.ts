/**
 * Logger utility for WebSocketManager and other components
 * Provides batched, collapsible logging for better debugging
 */

// Define the namespace for the project's logging system
export namespace ParkbeatLogger {
  export type LogLevel = 'log' | 'debug' | 'info' | 'warn' | 'error';
  
  type LogGroup = {
    id: string;
    title: string;
    messages: LogMessage[];
    startTime: number;
    collapsed: boolean;
    logCollapsed: boolean;
    useConsoleGroup: boolean; // Whether to use console.group when flushing
  };
  
  type LogMessage = {
    level: LogLevel;
    message: string;
    data?: any;
    timestamp: number;
  };
  
  export type Handler<T extends LogLevel> = (...args: Parameters<typeof console[T]>) => void;
  export type ConsoleMethod = (...data: any[]) => void;
  
  // Interface for logger plugins
  export interface LoggerPlugin {
    name: string;
    onLog?: (level: LogLevel, message: string, ...data: any[]) => void;
    onInit?: () => void;
    onDisable?: () => void;
  }
  
  // Extended console methods interface to include group methods
  interface ExtendedConsoleMethods extends Record<LogLevel, ConsoleMethod> {
    group: ConsoleMethod;
    groupCollapsed: ConsoleMethod;
    groupEnd: ConsoleMethod;
  }
  
  /**
   * Base Logger class that can be extended
   */
  export abstract class BaseLogger {
    protected _isEnabled: boolean = true;
    protected _logLevel: LogLevel = 'debug';
    
    /**
     * Enable or disable logging
     */
    public setEnabled(enabled: boolean): void {
      this._isEnabled = enabled;
    }
    
    /**
     * Get the current enabled state
     */
    public isEnabled(): boolean {
      return this._isEnabled;
    }
    
    /**
     * Set the minimum log level
     */
    public setLogLevel(level: LogLevel): void {
      this._logLevel = level;
    }
    
    /**
     * Get the current log level
     */
    public getLogLevel(): LogLevel {
      return this._logLevel;
    }
    
    /**
     * Check if a message should be logged based on the current log level
     */
    protected shouldLog(level: LogLevel): boolean {
      const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
      const currentLevelIndex = levels.indexOf(this._logLevel);
      const messageLevelIndex = levels.indexOf(level);
      
      return messageLevelIndex >= currentLevelIndex;
    }
    
    // These methods will be implemented by subclasses
    public abstract log: Handler<'log'>;
    public abstract debug: Handler<'debug'>;
    public abstract info: Handler<'info'>;
    public abstract warn: Handler<'warn'>;
    public abstract error: Handler<'error'>;
  }
  
  /**
   * GroupLogger is a specialized logger for a specific group
   * It forwards all logs to the parent logger with the group context
   */
  export class GroupLogger extends BaseLogger {
    private parentLogger: Logger;
    private groupId: string;
    private useConsoleGroup: boolean;
    
    constructor(parentLogger: Logger, groupId: string, useConsoleGroup: boolean = false) {
      super();
      this.parentLogger = parentLogger;
      this.groupId = groupId;
      this.useConsoleGroup = useConsoleGroup;
      
      // Inherit settings from parent
      this._isEnabled = parentLogger.isEnabled();
      this._logLevel = parentLogger.getLogLevel();
    }
    
    /**
     * Log methods that forward to the parent logger with group context
     */
    public log: Handler<'log'> = (...args) => {
      if (!this._isEnabled || !this.shouldLog('log')) return;
      this.parentLogger.logToGroup(this.groupId, 'log', ...args);
    };
    
    public debug: Handler<'debug'> = (...args) => {
      if (!this._isEnabled || !this.shouldLog('debug')) return;
      this.parentLogger.logToGroup(this.groupId, 'debug', ...args);
    };
    
    public info: Handler<'info'> = (...args) => {
      if (!this._isEnabled || !this.shouldLog('info')) return;
      this.parentLogger.logToGroup(this.groupId, 'info', ...args);
    };
    
    public warn: Handler<'warn'> = (...args) => {
      if (!this._isEnabled || !this.shouldLog('warn')) return;
      this.parentLogger.logToGroup(this.groupId, 'warn', ...args);
    };
    
    public error: Handler<'error'> = (...args) => {
      if (!this._isEnabled || !this.shouldLog('error')) return;
      this.parentLogger.logToGroup(this.groupId, 'error', ...args);
    };
    
    /**
     * End this group and flush its messages
     */
    public end(): void {
      this.parentLogger.groupEnd(this.groupId);
    }
    
    /**
     * Create a nested group
     */
    public group(id: string, title: string, collapsed: boolean = true, logCollapsed?: boolean, useConsoleGroup: boolean = false): GroupLogger {
      const nestedGroupId = `${this.groupId}:${id}`;
      return this.parentLogger.group(nestedGroupId, title, collapsed, logCollapsed, useConsoleGroup);
    }
  }
  
  export class Logger extends BaseLogger {
    private static instance: Logger;
    private groups: Map<string, LogGroup> = new Map();
    private batchTimeoutMs: number = 500;
    private batchTimeouts: Map<string, NodeJS.Timeout> = new Map();
    private plugins: LoggerPlugin[] = [];
    private originalConsole: ExtendedConsoleMethods;
    private consoleOverridden: boolean = false;
    private isLogging: boolean = false; // Guard flag to prevent recursive logging
    
    // Singleton pattern
    public static getInstance(overrideConsole: boolean = true): Logger {
      if (!Logger.instance) {
        Logger.instance = new Logger(overrideConsole);
      }
      return Logger.instance;
    }
    
    constructor(overrideConsole: boolean = true) {
      super();
      
      // Save original console methods safely
      this.originalConsole = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error,
        debug: console.debug || console.log,
        group: console.group || console.log,
        groupCollapsed: console.groupCollapsed || console.log,
        groupEnd: console.groupEnd || (() => {})
      };
      
      // Initialize with environment settings
      this._isEnabled = typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production';
      
      // Allow overriding via localStorage in browser environments
      if (typeof window !== 'undefined') {
        try {
          const storedLogLevel = localStorage.getItem('logger_level');
          if (storedLogLevel) {
            this._logLevel = storedLogLevel as LogLevel;
          }
          
          const storedEnabled = localStorage.getItem('logger_enabled');
          if (storedEnabled !== null) {
            this._isEnabled = storedEnabled === 'true';
          }
        } catch (e) {
          // Ignore localStorage errors
        }
      }

      if (overrideConsole && !this.consoleOverridden) {
        // this.overrideConsoleMethods();
      }

      // Initialize plugins
      this.plugins.forEach(plugin => {
        if (plugin.onInit) {
          plugin.onInit();
        }
      });
    }
  
    /**
     * Override the console methods to use our logger
     */
    public overrideConsoleMethods(): void {
      if (this.consoleOverridden) {
        return; // Already overridden
      }
      
      // Override standard console methods
      console.log = this.createConsoleMethod('log');
      console.info = this.createConsoleMethod('info');
      console.warn = this.createConsoleMethod('warn');
      console.error = this.createConsoleMethod('error');
      console.debug = this.createConsoleMethod('debug');
      
      // Add custom group methods to console
      const self = this;
      console.createGroup = function(...args: any[]) { 
        return self.group.apply(self, args as [string, string, boolean?, boolean?, boolean?]); 
      };
      console.endGroup = function(groupId: string) { 
        return self.groupEnd.call(self, groupId); 
      };
      console.getGroup = function(groupId: string) { 
        return self.getGroupLogger.call(self, groupId, true, false); // Default with useConsoleGroup=false
      };
      
      this.consoleOverridden = true;
    }
    
    /**
     * Restore original console methods
     */
    private restoreConsoleMethods(): void {
      if (this.consoleOverridden) {
        // Restore standard console methods
        console.log = this.originalConsole.log;
        console.info = this.originalConsole.info;
        console.warn = this.originalConsole.warn;
        console.error = this.originalConsole.error;
        console.debug = this.originalConsole.debug;
        
        // Remove custom group methods
        delete (console as any).createGroup;
        delete (console as any).createConsoleGroup;
        delete (console as any).endGroup;
        delete (console as any).getGroup;
        delete (console as any).getConsoleGroup;
        
        this.consoleOverridden = false;
      }
    }
    
    /**
     * Create a console method that uses our logger
     */
    private createConsoleMethod(level: LogLevel): ConsoleMethod {
      const self = this;
      return function(...args: any[]) {
        // Prevent recursive logging
        if (self.isLogging) {
          // Only call the original console method to avoid recursion
          if (self.originalConsole[level]) {
            self.originalConsole[level].apply(console, args);
          }
          return;
        }
        
        // Set the flag before calling handler
        self.isLogging = true;
        try {
          self.handler(level, ...args);
          // Don't call the original method here, as handler will do it if needed
        } finally {
          self.isLogging = false;
        }
      };
    }
    
    /**
     * Register a plugin with the logger
     */
    public registerPlugin(plugin: LoggerPlugin): Logger {
      this.plugins.push(plugin);
      if (this._isEnabled && plugin.onInit) {
        plugin.onInit();
      }
      return this;
    }
    
    /**
     * Unregister a plugin by name
     */
    public unregisterPlugin(pluginName: string): Logger {
      const pluginIndex = this.plugins.findIndex(p => p.name === pluginName);
      if (pluginIndex !== -1) {
        const plugin = this.plugins[pluginIndex];
        if (plugin && plugin.onDisable) {
          plugin.onDisable();
        }
        this.plugins.splice(pluginIndex, 1);
      }
      return this;
    }
    
    /**
     * Enable or disable logging
     */
    public setEnabled(enabled: boolean): void {
      this._isEnabled = enabled;
      
      if (enabled) {
        // Re-initialize plugins
        this.plugins.forEach(plugin => {
          if (plugin.onInit) {
            plugin.onInit();
          }
        });
      } else {
        // Disable plugins
        this.plugins.forEach(plugin => {
          if (plugin.onDisable) {
            plugin.onDisable();
          }
        });
        
        // Restore console methods if they were overridden
        this.restoreConsoleMethods();
      }
      
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('logger_enabled', String(enabled));
        } catch (e) {
          // Ignore localStorage errors
        }
      }
    }
    
    /**
     * Set the minimum log level
     */
    public setLogLevel(level: LogLevel): void {
      this._logLevel = level;
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('logger_level', level);
        } catch (e) {
          // Ignore localStorage errors
        }
      }
    }
    
    /**
     * Start a new log group or get an existing one
     * Returns a GroupLogger instance for the group
     */
    public group(id: string, title: string, collapsed: boolean = true, logCollapsed?: boolean, useConsoleGroup: boolean = false): GroupLogger {
      if (!this._isEnabled) return new GroupLogger(this, id, useConsoleGroup);
      
      if (!this.groups.has(id)) {
        this.groups.set(id, {
          id,
          title,
          messages: [],
          startTime: Date.now(),
          collapsed,
          logCollapsed: logCollapsed !== undefined ? logCollapsed : collapsed,
          useConsoleGroup
        });
      }
      
      return new GroupLogger(this, id, useConsoleGroup);
    }
    
    /**
     * Get a GroupLogger instance for an existing group
     */
    public getGroupLogger(groupId: string, collapsed: boolean = true, useConsoleGroup: boolean = false): GroupLogger {
      // Create the group if it doesn't exist
      if (!this.groups.has(groupId)) {
        return this.group(groupId, groupId, collapsed, collapsed, useConsoleGroup);
      }
      
      return new GroupLogger(this, groupId, useConsoleGroup);
    }
  
    /**
     * Log directly to a specific group
     */
    public logToGroup(groupId: string, level: LogLevel, ...args: any[]): void {
      if (!this._isEnabled) return;
      
      // Create group if it doesn't exist
      if (!this.groups.has(groupId)) {
        this.group(groupId, groupId);
      }
      
      // Add message to group
      const message = args[0];
      const data = args.slice(1);
      
      this.addMessage(groupId, level, message, data);
      
      // Notify plugins
      this.notifyPlugins(level, message, ...data);
    }
  
    private handler = (logMethod: LogLevel, ...args: Parameters<typeof console[LogLevel]>) => {
      if (!this._isEnabled) return;
      
      // We don't need to check isLogging here anymore as it's handled in createConsoleMethod
      // The flag is already set before this method is called
      
      try {
        // Extract group title from message if possible
        const maybeExtractGroupTitle = (param: typeof args[0]) => {
          if (typeof param === 'string' && param.startsWith('[')) {
            const end = param.indexOf(']');
            if (end !== -1) {
              return param.slice(1, end);
            }
          }
          return null;
        };
    
        let groupTitle = maybeExtractGroupTitle(args[0]);
        let message = args[0];
        let data = args.slice(1);
    
        if (groupTitle) {
          // If we extracted a group title, update the message and data
          if (typeof args[0] === 'string') {
            message = args[0].substring(args[0].indexOf(']') + 1).trim();
            if (message === '') {
              message = args[1];
              data = args.slice(2);
            }
          }
        } else if (args.length > 2) {
          groupTitle = String(args[0]);
        } else {
          groupTitle = 'Generic logs';
        }
    
        // Add message to group
        this.addMessage(groupTitle, logMethod, message, data);
        
        // Notify plugins
        this.notifyPlugins(logMethod, message, ...data);
        
        // If console is not overridden, log to console
        if (!this.consoleOverridden) {
          this.originalConsole[logMethod](...args);
        }
      } catch (error) {
        // If there's an error in our logging logic, log it with the original console
        // to avoid infinite recursion
        this.originalConsole.error('[Logger] Error in handler:', error);
      }
      // No need for finally block to reset isLogging as it's handled in createConsoleMethod
    };
    
    /**
     * Notify all plugins about a log event
     */
    private notifyPlugins(level: LogLevel, message: any, ...data: any[]): void {
      if (!this._isEnabled) return;
      
      const messageStr = typeof message === 'string' ? message : String(message || '');
      
      this.plugins.forEach(plugin => {
        if (plugin.onLog) {
          try {
            plugin.onLog(level, messageStr, ...data);
          } catch (error) {
            this.originalConsole.error(`[Logger] Error in plugin ${plugin.name}:`, error);
          }
        }
      });
    }
    
    public log: Handler<'log'> = (...args) => this.handler('log', ...args);
    public debug: Handler<'debug'> = (...args) => this.handler('debug', ...args);
    public info: Handler<'info'> = (...args) => this.handler('info', ...args);
    public warn: Handler<'warn'> = (...args) => this.handler('warn', ...args);
    public error: Handler<'error'> = (...args) => this.handler('error', ...args);
    
    /**
     * End a log group and flush its messages
     */
    public groupEnd(groupId: string): void {
      if (!this._isEnabled) return;
      
      // Force flush the group
      this.flushGroup(groupId);
      
      // Remove the group
      this.groups.delete(groupId);
    }
    
    /**
     * Add a message to a group and schedule flushing
     */
    private addMessage(groupId: string, logMethod: LogLevel, message: any, data?: any): void {
      if (!this._isEnabled) return;
      
      // Check if the message meets the minimum log level
      if (!this.shouldLog(logMethod)) return;
      
      // Create group if it doesn't exist
      if (!this.groups.has(groupId)) {
        this.group(groupId, groupId, true, true, false); // Explicitly disable console.group by default
      }
      
      // Add message to group
      const group = this.groups.get(groupId)!;
      const messageStr = typeof message === 'string' ? message : String(message || '');
      
      group.messages.push({
        level: logMethod,
        message: messageStr,
        data,
        timestamp: Date.now()
      });
      
      // Schedule flush if not already scheduled
      if (!this.batchTimeouts.has(groupId)) {
        const timeout = setTimeout(() => {
          this.flushGroup(groupId);
          this.batchTimeouts.delete(groupId);
        }, this.batchTimeoutMs);
        
        this.batchTimeouts.set(groupId, timeout);
      }
    }
    
    /**
     * Flush all messages in a group to the console
     */
    private flushGroup(groupId: string): void {
      if (!this._isEnabled) return;
      
      const group = this.groups.get(groupId);
      if (!group || !group.messages || group.messages.length === 0) return;
      
      // Clear any pending timeout
      const timeout = this.batchTimeouts.get(groupId);
      if (timeout) {
        clearTimeout(timeout);
        this.batchTimeouts.delete(groupId);
      }
      
      // Calculate elapsed time
      const elapsed = Date.now() - group.startTime;
      const formattedElapsed = elapsed < 1000 ? `${elapsed}ms` : `${(elapsed / 1000).toFixed(2)}s`;
      
      // Create group title with count and elapsed time
      const title = `${group.title} (${group.messages.length} events, ${formattedElapsed})`;
      
      // Check if we're in a browser environment with console.group support
      const hasGroupSupport = typeof console !== 'undefined' && 
                             typeof console.group === 'function' && 
                             typeof console.groupEnd === 'function';
      
      // Whether we should use console.group based on configuration and support
      const shouldUseConsoleGroup = group.useConsoleGroup && hasGroupSupport;
      
      // Log group title to console
      if (shouldUseConsoleGroup) {
        if (
          group.logCollapsed
          && typeof console.groupCollapsed === 'function'
        ) {
          Function.prototype.apply.call(this.originalConsole.groupCollapsed, console, [title]);
        } else {
          Function.prototype.apply.call(this.originalConsole.group, console, [title]);
        }
      } else {
        // Always use simple logging instead of console.group
        Function.prototype.apply.call(this.originalConsole.log, console, [`=== ${title} ===`]);
      }
      
      // Break logs into pages of 10
      const PAGE_SIZE = 10;
      const totalPages = Math.ceil(group.messages.length / PAGE_SIZE);
      
      for (let page = 0; page < totalPages; page++) {
        const startIdx = page * PAGE_SIZE;
        const endIdx = Math.min(startIdx + PAGE_SIZE, group.messages.length);
        
        // Create a subgroup for each page if there are multiple pages
        if (totalPages > 1 && shouldUseConsoleGroup) {
          const pageTitle = `Page ${page + 1}/${totalPages} (logs ${startIdx + 1}-${endIdx})`;
          if (group.logCollapsed && typeof console.groupCollapsed === 'function') {
            Function.prototype.apply.call(this.originalConsole.groupCollapsed, console, [pageTitle]);
          } else {
            Function.prototype.apply.call(this.originalConsole.group, console, [pageTitle]);
          }
        } else if (totalPages > 1) {
          // Fallback for environments without console.group or when not using it
          Function.prototype.apply.call(this.originalConsole.log, console, [`--- ${page + 1}/${totalPages} (logs ${startIdx + 1}-${endIdx}) ---`]);
        }
        
        // Log messages for this page
        for (let i = startIdx; i < endIdx; i++) {
          const msg = group.messages[i];
          if (!msg) continue;
          
          try {
            // Create timestamp prefix
            const timestamp = typeof msg.timestamp === 'number' 
              ? new Date(msg.timestamp).toISOString().split('T')[1]?.slice(0, -1) ?? 'unknown'
              : new Date().toISOString().split('T')[1]?.slice(0, -1) ?? 'unknown';
            
            const prefix = `%c[${timestamp}]`;
            const prefixStyle = 'color: #888;'; // Light grey color for the timestamp
            const message = msg.message;
            const data = msg.data;
            
            // Prepare arguments array for console methods
            const args = [prefix, prefixStyle, message];
            
            // Only add data to args if it's non-empty
            const isDataEmpty = 
              data === undefined || 
              data === null || 
              (Array.isArray(data) && data.length === 0) ||
              (typeof data === 'object' && Object.keys(data).length === 0);
              
            if (!isDataEmpty) {
              args.push(data);
            }
            
            // Log based on level with stack trace preservation
            if (
              msg.level === 'debug'
              && 'debug' in this.originalConsole
              && typeof this.originalConsole.debug === 'function'
            ) {
              Function.prototype.apply.call(this.originalConsole.debug, console, args);
            } else if (
              msg.level === 'info'
              && 'info' in this.originalConsole
              && typeof this.originalConsole.info === 'function'
            ) {
              Function.prototype.apply.call(this.originalConsole.info, console, args);
            } else if (
              msg.level === 'warn'
              && 'warn' in this.originalConsole
              && typeof this.originalConsole.warn === 'function'
            ) {
              Function.prototype.apply.call(this.originalConsole.warn, console, args);
            } else if (
              msg.level === 'error'
              && 'error' in this.originalConsole
              && typeof this.originalConsole.error === 'function'
            ) {
              Function.prototype.apply.call(this.originalConsole.error, console, args);
            } else if (
              msg.level === 'log'
              && 'log' in this.originalConsole
              && typeof this.originalConsole.log === 'function'
            ) {
              Function.prototype.apply.call(this.originalConsole.log, console, args);
            }
          } catch (error) {
            // If there's an error logging, fallback to a simple console.log
            try {
              Function.prototype.apply.call(this.originalConsole.error, console, ['[Logger Error]', error]);
              Function.prototype.apply.call(this.originalConsole.log, console, [msg]);
            } catch {
              // Last resort - do nothing if even this fails
            }
          }
        }
        
        // End the page subgroup if there are multiple pages
        if (totalPages > 1 && shouldUseConsoleGroup) {
          Function.prototype.apply.call(this.originalConsole.groupEnd, console, []);
        }
      }
      
      // End the group if supported and enabled
      if (shouldUseConsoleGroup) {
        Function.prototype.apply.call(this.originalConsole.groupEnd, console, []);
      } else {
        Function.prototype.apply.call(this.originalConsole.log, console, [`=== End ${title} ===`]);
      }
      
      // Clear messages after flushing
      group.messages = [];
    }
    
    /**
     * Flush all pending log groups
     */
    public flushAll(): void {
      if (!this._isEnabled) return;
      
      // Flush all groups
      for (const groupId of this.groups.keys()) {
        this.flushGroup(groupId);
      }
      
      // Clear all timeouts
      this.batchTimeouts.forEach((timeout) => {
        if (timeout) {
          clearTimeout(timeout);
        }
      });
      this.batchTimeouts.clear();
    }
    
    /**
     * Clean up the logger instance
     */
    public destroy(): void {
      this.flushAll();
      this.setEnabled(false);
      this.plugins = [];
    }
  }

  // Create a convenience function for getting the logger instance
  export const getLogger = (overrideConsole: boolean = true): Logger => Logger.getInstance(overrideConsole);
}

// Export the main types and functions for easier access
export type LogLevel = ParkbeatLogger.LogLevel;
export type LoggerPlugin = ParkbeatLogger.LoggerPlugin;
export type GroupLogger = ParkbeatLogger.GroupLogger;
export type Logger = ParkbeatLogger.Logger;

// Export the main functions for easier access
export const getLogger = ParkbeatLogger.getLogger;