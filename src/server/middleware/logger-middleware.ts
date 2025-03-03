import type { JStack } from "../jstack";
import { getLogger } from "@/lib/logger";

/**
 * Middleware that initializes the logger for server-side requests
 * This ensures that all console helpers are available in server-side code
 */
export const getLoggerMiddleware = (j: JStack) => j.middleware(async ({ c, next }) => {
  // Initialize the logger with console overriding
  const logger = getLogger(true);
  
  // Set appropriate log level based on environment
  const isDev = process.env.NODE_ENV !== 'production';
  logger.setLogLevel(isDev ? 'debug' : 'info');
  
  // Create a request-specific logger group for better tracing
  const requestId = crypto.randomUUID().slice(0, 8);
  const method = c.req.method;
  const path = new URL(c.req.url).pathname;
  const startTime = Date.now();
  
  const requestLogger = logger.group(
    `req_${requestId}`, 
    `${method} ${path}`,
    true // collapsed by default
  );
  
  // Log basic request information
  requestLogger.info('Request started', {
    method,
    path,
    headers: Object.fromEntries(
      Array.from(c.req.raw.headers.entries())
    ),
    timestamp: new Date().toISOString()
  });
  
  // Add logger to context for use in route handlers
  const result = await next({ 
    logger: requestLogger,
    mainLogger: logger
  });
  
  // Log response information
  requestLogger.info('Request completed', {
    duration: `${Date.now() - startTime}ms`
  });
  
  // End the request logger group
  requestLogger.end();
  
  return result;
});

// Helper type to extract the logger from the context
export type LoggerContext = {
  logger: ReturnType<typeof getLogger>['group'] extends (id: string, title: string) => infer R ? R : never;
  mainLogger: ReturnType<typeof getLogger>;
}; 