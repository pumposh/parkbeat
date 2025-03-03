/**
 * WebSocketLogger - A specialized logger for WebSocketManager
 * Wraps the Logger class to provide simpler methods for WebSocketManager
 */

import { getLogger, Logger } from './logger';

/**
 * Safely convert any value to a string
 */
function safeToString(value: any): string {
  if (typeof value === 'symbol') {
    return String(value);
  }
  return String(value);
}

export class WebSocketLogger {
  private logger: Logger;
  private groupId: string = 'wsm';

  constructor() {
    this.logger = getLogger();
  }

  /**
   * Log an info message
   */
  public info(message: string | symbol, ...data: any[]): void {
    const safeMessage = typeof message === 'symbol' ? String(message) : message;
    this.logger.info(this.groupId, safeMessage, data.length ? data : undefined);
  }

  /**
   * Log a debug message
   */
  public debug(message: string | symbol, ...data: any[]): void {
    const safeMessage = typeof message === 'symbol' ? String(message) : message;
    this.logger.debug(this.groupId, safeMessage, data.length ? data : undefined);
  }

  /**
   * Log a warning message
   */
  public warn(message: string | symbol, ...data: any[]): void {
    const safeMessage = typeof message === 'symbol' ? String(message) : message;
    this.logger.warn(this.groupId, safeMessage, data.length ? data : undefined);
  }

  /**
   * Log an error message
   */
  public error(message: string | symbol, ...data: any[]): void {
    const safeMessage = typeof message === 'symbol' ? String(message) : message;
    this.logger.error(this.groupId, safeMessage, data.length ? data : undefined);
  }

  /**
   * Start a new log group
   */
  public startGroup(title: string): void {
    this.logger.group(this.groupId, title);
  }

  /**
   * End the current log group
   */
  public endGroup(): void {
    this.logger.groupEnd(this.groupId);
  }
}

// Create a singleton instance
let instance: WebSocketLogger | null = null;

export const getWebSocketLogger = (): WebSocketLogger => {
  if (!instance) {
    instance = new WebSocketLogger();
  }
  return instance;
}; 