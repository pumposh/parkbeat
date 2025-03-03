# Server Logger Middleware

This middleware adds structured logging capabilities to your server-side code. It initializes the logger for each request and makes it available in the context of your route handlers.

## Features

- Automatic request logging with unique request IDs
- Grouped logs for each request
- Stack trace preservation
- Timestamp prefixes in light grey
- Pagination for large log groups (10 logs per page)
- Empty data filtering (only shows data when it's non-empty)

## Usage

### Basic Usage

The logger middleware is already included in the `publicProcedure` in `src/server/jstack.ts`. You can access the logger directly from the context in your route handlers:

```typescript
import { publicProcedure } from "../jstack";

export const myRouter = {
  myEndpoint: publicProcedure
    .query(({ ctx }) => {
      // Access the logger from context
      const logger = ctx.logger;
      
      // Use different log levels
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');
      
      // Log with data
      logger.info('User action', { userId: '123', action: 'login' });
      
      return { success: true };
    })
};
```

### Creating Log Groups

You can create log groups to organize related logs:

```typescript
const operationLogger = ctx.logger.group(
  'operation_id', 
  'Operation Title',
  true // collapsed by default
);

operationLogger.info('Starting operation');
// ... perform operation ...
operationLogger.info('Operation completed');

// Don't forget to end the group when done
operationLogger.end();
```

### Logging Errors

Use the logger to log errors with stack traces:

```typescript
try {
  // ... code that might throw ...
} catch (error) {
  ctx.logger.error('Error occurred', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    // Add any additional context
    operation: 'operationName',
    input: someInput
  });
  
  // Handle the error...
}
```

### Performance Logging

You can use the logger to track performance:

```typescript
const startTime = Date.now();

// ... perform operation ...

const duration = Date.now() - startTime;
ctx.logger.info('Operation completed', { durationMs: duration });
```

## Utility Functions

For logging outside of request handlers, you can use the utility functions in `src/server/utils/logger.ts`:

```typescript
import { getServerLogger, createComponentLogger } from "../utils/logger";

// Get the main server logger
const logger = getServerLogger();

// Create a logger for a specific component
const componentLogger = createComponentLogger('MyComponent');
```

## Configuration

The logger is configured in the middleware with appropriate log levels based on the environment:

- Development: `debug` level (shows all logs)
- Production: `info` level (only shows info, warn, and error logs)

You can change the log level for a specific request if needed:

```typescript
ctx.logger.setLogLevel('warn'); // Only show warnings and errors
``` 