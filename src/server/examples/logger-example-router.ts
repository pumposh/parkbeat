import { publicProcedure } from "../jstack";
import { z } from "zod";
import { getContextLogger, logError } from "../utils/logger";

/**
 * Example router that demonstrates how to use the logger in server-side code
 */
export const loggerExampleRouter = {
  /**
   * Basic logging example
   */
  basicLogging: publicProcedure
    .query(({ ctx, c }) => {
      // Get the logger from context
      const logger = getContextLogger(ctx);
      
      // Log at different levels
      logger.debug('This is a debug message');
      logger.info('This is an info message');
      logger.warn('This is a warning message');
      logger.error('This is an error message');
      
      // Log with data
      logger.info('User action', { 
        userId: '123', 
        action: 'login',
        timestamp: new Date().toISOString()
      });
      
      // Return using c.json()
      return c.json({
        success: true,
        message: 'Logging example completed'
      });
    }),
    
  /**
   * Example of logging errors with stack traces
   */
  errorLogging: publicProcedure
    .input(z.object({
      shouldThrow: z.boolean().default(false)
    }))
    .query(({ ctx, c, input }) => {
      const logger = getContextLogger(ctx);
      
      try {
        // Simulate an error
        if (input.shouldThrow) {
          throw new Error('This is a test error');
        }
        
        // Log a caught error
        const error = new Error('This is a caught error');
        logError(error, {
          operation: 'errorLogging',
          input
        }, ctx.mainLogger);
        
        // Return using c.json()
        return c.json({
          success: true,
          message: 'Error logged successfully'
        });
      } catch (error) {
        // Log the uncaught error
        logError(error, {
          operation: 'errorLogging',
          input,
          uncaught: true
        }, ctx.mainLogger);
        
        // Return using c.json()
        return c.json({
          success: false,
          message: 'Error thrown and logged'
        });
      }
    }),
    
  /**
   * Example of using log groups for performance logging
   */
  performanceLogging: publicProcedure
    .query(async ({ ctx, c }) => {
      const logger = getContextLogger(ctx);
      
      // Create a group for this operation
      const operationLogger = logger.group(
        'perf_operation', 
        'Performance Operation',
        false // not collapsed
      );
      
      operationLogger.info('Starting operation');
      
      // Track performance
      const startTime = Date.now();
      
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Log step completion with timing
      operationLogger.info('Step 1 completed', { 
        durationMs: Date.now() - startTime 
      });
      
      // Simulate more work
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Log final timing
      const totalDuration = Date.now() - startTime;
      operationLogger.info('Operation completed', { 
        totalDurationMs: totalDuration,
        timestamp: new Date().toISOString()
      });
      
      // End the group when done
      operationLogger.end();
      
      // Return using c.json()
      return c.json({
        success: true,
        durationMs: totalDuration
      });
    })
}; 