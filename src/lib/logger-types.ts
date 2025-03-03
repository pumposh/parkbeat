/**
 * Type definitions for the ParkbeatLogger namespace
 * This file is used to provide type information for the global.d.ts file
 */

export namespace ParkbeatLogger {
  export type LogLevel = 'log' | 'debug' | 'info' | 'warn' | 'error';
  
  export type Handler<T extends LogLevel> = (...args: Parameters<typeof console[T]>) => void;
  export type ConsoleMethod = (...data: any[]) => void;
  
  export interface LoggerPlugin {
    name: string;
    onLog?: (level: LogLevel, message: string, ...data: any[]) => void;
    onInit?: () => void;
    onDisable?: () => void;
  }
  
  export interface BaseLogger {
    setEnabled(enabled: boolean): void;
    isEnabled(): boolean;
    setLogLevel(level: LogLevel): void;
    getLogLevel(): LogLevel;
    
    log: Handler<'log'>;
    debug: Handler<'debug'>;
    info: Handler<'info'>;
    warn: Handler<'warn'>;
    error: Handler<'error'>;
  }
  
  export interface GroupLogger extends BaseLogger {
    end(): void;
    group(id: string, title: string, collapsed?: boolean, logCollapsed?: boolean): GroupLogger;
  }
  
  export interface Logger extends BaseLogger {
    init(overrideConsole?: boolean): Logger;
    registerPlugin(plugin: LoggerPlugin): Logger;
    unregisterPlugin(pluginName: string): Logger;
    
    group(id: string, title: string, collapsed?: boolean, logCollapsed?: boolean): GroupLogger;
    getGroupLogger(groupId: string): GroupLogger;
    groupEnd(groupId: string): void;
    flushAll(): void;
    destroy(): void;
  }
} 