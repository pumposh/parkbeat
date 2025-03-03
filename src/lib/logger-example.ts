/**
 * Example usage of the Logger and RemoteLoggerPlugin
 */

import { getLogger, GroupLogger, ParkbeatLogger } from './logger';
import { remoteLogger } from './remote-logger';

/**
 * Initialize the logging system
 */
export function initLogging(options: {
  enableRemoteLogging?: boolean;
  remoteLoggingUrl?: string;
  overrideConsole?: boolean;
} = {}) {
  const {
    enableRemoteLogging = false,
    remoteLoggingUrl = 'https://logs.example.com/api/logs',
    overrideConsole = true
  } = options;
  
  // Initialize the main logger
  const logger = getLogger(overrideConsole);
  
  // Initialize remote logging if enabled
  if (enableRemoteLogging && remoteLoggingUrl) {
    remoteLogger.init(remoteLoggingUrl);
    console.info('[Logging] Remote logging enabled');
  }
  
  return logger;
}

/**
 * Example usage
 */
export function exampleUsage() {
  // Initialize logging
  initLogging({
    enableRemoteLogging: true,
    overrideConsole: true
  });
  
  // Now all console logs will go through our logger
  console.log('This is a regular log message');
  console.info('[MyComponent] This will be grouped under MyComponent');
  console.warn('[MyComponent] Warning message');
  console.error('Error message');
  
  // You can also use the logger directly
  const logger = getLogger();
  logger.log('Direct logger usage');
  logger.info('[DirectGroup] Info message');
  
  // Create a group manually and get a GroupLogger instance
  const apiLogger = logger.group('api', 'API Calls', false);
  
  // Use the group logger directly - all logs will be in the 'api' group
  apiLogger.info('Making API request to /users');
  apiLogger.debug('Request payload:', { id: 123 });
  apiLogger.info('Response received');
  
  // Create a nested group for a specific API call
  const userApiLogger = apiLogger.group('users', 'User API');
  userApiLogger.info('Fetching user profile');
  userApiLogger.warn('User profile incomplete');
  
  // End the nested group when done
  userApiLogger.end();
  
  // End the parent group when done with all API calls
  apiLogger.end();
  
  // Example of using the extended console methods
  // Create a new group using console.createGroup
  const authGroup = getLogger().group('auth', 'Authentication', false);
  authGroup.info('User login attempt');
  authGroup.debug('Login details:', { username: 'user@example.com' });
  
  // Log to an existing group using console.getGroup
  const existingGroup = getLogger().getGroupLogger('MyComponent');
  existingGroup.warn('This is added to the existing MyComponent group');
  
  // End a group using console.endGroup
  getLogger().groupEnd('auth');
  
  // Example of using a group for a function call
  function processData(data: any, logger: GroupLogger) {
    logger.info('Processing data:', data);
    
    // Do some work...
    
    logger.info('Data processing complete');
  }
  
  // Create a group for the data processing
  const dataLogger = logger.group('data-processing', 'Data Processing');
  processData({ items: [1, 2, 3] }, dataLogger);
  dataLogger.end();
  
  // Example of using the namespace directly
  const customLogger = new ParkbeatLogger.Logger();
  customLogger.setLogLevel('warn');
  customLogger.warn('This is a warning from a custom logger instance');
  
  // Disable remote logging when not needed
  remoteLogger.disable();
  
  // Disable all logging
  logger.setEnabled(false);
}

// Uncomment to run the example
// exampleUsage(); 