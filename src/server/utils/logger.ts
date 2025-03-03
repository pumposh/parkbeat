import { getLogger } from "@/lib/logger";
import { LoggerContext } from "../middleware/logger-middleware";

/**
 * Server-side logger utility functions
 */

// Initialize the main server logger
const serverLogger = getLogger(true);

// Set appropriate log level based on environment
const isDev = process.env.NODE_ENV !== 'production';
serverLogger.setLogLevel(isDev ? 'debug' : 'log');

/**
 * Get the main server logger instance
 * Use this for logging outside of request contexts
 */
export const getServerLogger = () => serverLogger;

/**
 * Create a new logger group with the given ID and title
 * @param id Unique identifier for the group
 * @param title Display title for the group
 * @param collapsed Whether the group should be collapsed by default
 */
export const createLoggerGroup = (id: string, title: string, collapsed = true) => {
  return serverLogger.group(id, title, collapsed);
};

/**
 * Helper to extract the logger from a procedure context
 * @param ctx The procedure context that includes the logger
 */
export const getContextLogger = (ctx: LoggerContext) => {
  return ctx.logger;
};

/**
 * Create a logger for a specific component or module
 * @param component The name of the component or module
 */
export const createComponentLogger = (component: string) => {
  const id = `component_${component}_${Date.now()}`;
  return serverLogger.group(id, `Component: ${component}`, true);
};

/**
 * Log an error with stack trace and additional context
 * @param error The error object
 * @param context Additional context about where/why the error occurred
 * @param logger Optional logger to use (defaults to server logger)
 */
export const logError = (
  error: Error | unknown, 
  context: Record<string, any> = {}, 
  logger = serverLogger
) => {
  const errorObj = error instanceof Error ? error : new Error(String(error));
  
  logger.error('Error occurred', {
    message: errorObj.message,
    stack: errorObj.stack,
    ...context
  });
  
  return errorObj;
}; 