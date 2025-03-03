# Server-Side Logging System

This document outlines how to use the logging system in the server-side code of the Parkbeat application.

## Overview

The Parkbeat server uses a structured logging system that provides:

- Request-specific logging groups
- Different log levels (debug, info, warn, error)
- Stack trace preservation
- Automatic request/response logging
- Timestamp prefixes
- Pagination for large log groups

## How to Access the Logger

### In Route Handlers

The logger is automatically available in the context of all route handlers:

```typescript
// In a procedure
publicProcedure
  .query(({ ctx }) => {
    // Access the logger from context
    const { logger } = ctx;
    
    // Use different log levels
    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warning message');
    logger.error('Error message');
    
    // Log with data
    logger.info('User action', { userId: '123', action: 'login' });
    
    return c.json({ success: true });
  })
```

### In WebSocket Handlers

For WebSocket handlers, the logger is also available in the context:

```typescript
publicProcedure
  .ws(({ ctx, io }) => {
    const { logger } = ctx;
    
    return {
      onConnect({ socket }) {
        logger.info('Client connected', { socketId: socket.id });
      },
      onDisconnect({ socket }) {
        logger.info('Client disconnected', { socketId: socket.id });
      }
    };
  })
```

### In Helper Functions

When passing the logger to helper functions, use the logger from the context:

```typescript
const { someHelper } = getHelpers({ ctx, logger: ctx.logger });
```

## Utility Functions

For logging outside of request handlers, use the utility functions in `src/server/utils/logger.ts`:

```typescript
import { getServerLogger, createComponentLogger, logError } from "../utils/logger";

// Get the main server logger
const logger = getServerLogger();

// Create a logger for a specific component
const componentLogger = createComponentLogger('MyComponent');

// Log errors with stack traces
try {
  // Some code that might throw
} catch (error) {
  logError(error, { operation: 'myOperation' });
}
```

## Creating Log Groups

You can create log groups to organize related logs:

```typescript
const operationLogger = logger.group(
  'operation_id', 
  'Operation Title',
  true,  // collapsed by default in UI
  false  // not collapsed when logging to console
);

operationLogger.info('Starting operation');
// ... perform operation ...
operationLogger.info('Operation completed');

// Don't forget to end the group when done
operationLogger.end();
```

### Controlling Group Collapse Behavior

The `group` method accepts two boolean parameters to control collapse behavior:

1. `collapsed` - Controls whether the group is collapsed by default in the UI
2. `logCollapsed` - Controls whether the group is collapsed when logging to the console

This allows you to have different collapse behaviors for UI display versus console output:

```typescript
// Collapsed in UI, but expanded in console for better visibility
logger.group('important_logs', 'Important Logs', true, false);

// Expanded in UI, but collapsed in console to save space
logger.group('verbose_logs', 'Verbose Logs', false, true);
```

If `logCollapsed` is not specified, it defaults to the same value as `collapsed`.

## Best Practices

1. **Use the appropriate log level**:
   - `debug`: Detailed information for debugging
   - `info`: General information about application flow
   - `warn`: Warning conditions that don't cause errors
   - `error`: Error conditions that affect functionality

2. **Include context in logs**:
   ```typescript
   logger.info('Processing request', { 
     userId, 
     requestId, 
     parameters 
   });
   ```

3. **Log errors with stack traces**:
   ```typescript
   try {
     // Code that might throw
   } catch (error) {
     logger.error('Error occurred', {
       message: error instanceof Error ? error.message : String(error),
       stack: error instanceof Error ? error.stack : undefined,
       context: { operation: 'operationName' }
     });
   }
   ```

4. **End log groups**:
   Always call `groupLogger.end()` when done with a log group to ensure proper cleanup.

## Example Router

See `src/server/examples/logger-example-router.ts` for complete examples of how to use the logger in different scenarios. 