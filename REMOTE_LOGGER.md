# Remote Logger for Parkbeat

This utility allows you to view console logs from your iOS simulator (or any mobile device) in a browser window. It's particularly useful for debugging mobile applications where accessing the console directly can be challenging.

## Features

- Capture all console logs (`log`, `info`, `warn`, `error`, `debug`)
- View logs in real-time in a browser window
- Filter logs by type
- Search through logs with text search
- Dark mode support with system preference detection
- Automatically enabled in development mode
- UI controls to enable/disable logging

## Setup

### 1. Install Dependencies

First, install the required dependencies for the remote logger server:

```bash
# Navigate to the project root
cd /path/to/parkbeat

# Install dependencies
npm install --save-dev express cors ws
```

Alternatively, you can use the provided `remote-logger-package.json`:

```bash
# Copy the package.json
cp remote-logger-package.json remote-logger/package.json

# Navigate to the remote logger directory
cd remote-logger

# Install dependencies
npm install
```

### 2. Start the Remote Logger Server

```bash
# Start the server
node remote-logger-server.js
```

This will start the server on port 3030 by default. You can access the log viewer at http://localhost:3030.

## Usage

### Automatic Usage

The remote logger is automatically enabled in development mode. You'll see a small bug icon (🐞) in the bottom right corner of your app. Click it to access the remote logger controls.

### Manual Usage

You can also manually control the remote logger using the global `__remoteLogger` object in the browser console:

```javascript
// Enable remote logging
window.__remoteLogger.enable('http://localhost:3030/logs');

// Disable remote logging
window.__remoteLogger.disable();
```

### Using in Components

If you need to access the remote logger in your components, you can use the `useRemoteLoggerContext` hook:

```jsx
import { useRemoteLoggerContext } from '@/providers/remote-logger-provider';

function MyComponent() {
  const { isEnabled, enableLogging, disableLogging } = useRemoteLoggerContext();
  
  // Use the remote logger
  return (
    <div>
      <button onClick={() => enableLogging()}>Enable Logging</button>
      <button onClick={disableLogging}>Disable Logging</button>
    </div>
  );
}
```

### Log Viewer Features

The log viewer includes several features to help you debug your application:

#### Dark Mode

The log viewer supports dark mode, which can be toggled using the switch in the top-right corner. By default, it will match your system's color scheme preference.

#### Filtering Logs

You can filter logs by type using the buttons at the top of the log viewer:
- **All**: Show all logs
- **Log**: Show only `console.log` messages
- **Info**: Show only `console.info` messages
- **Warn**: Show only `console.warn` messages
- **Error**: Show only `console.error` messages
- **Debug**: Show only `console.debug` messages

#### Searching Logs

You can search through logs using the search box in the top-right corner. The search is case-insensitive and will match against both the log message and any data included in the log.

#### Clearing Logs

You can clear all logs by clicking the "Clear Logs" button in the top-right corner.

## How It Works

1. The remote logger intercepts all console methods (`log`, `info`, `warn`, `error`, `debug`)
2. Logs are buffered and sent to the remote server at regular intervals
3. The server broadcasts the logs to all connected clients via WebSockets
4. The browser-based log viewer displays the logs in real-time

## Troubleshooting

- **No logs appearing?** Make sure the remote logger server is running and the correct URL is configured.
- **Server won't start?** Check if port 3030 is already in use. You can change the port in the `remote-logger-server.js` file.
- **Logs not sending?** Check your network connection and ensure CORS is properly configured.
- **Dark mode not working?** Make sure your browser supports the `prefers-color-scheme` media query and localStorage.

## Security Considerations

The remote logger is intended for development use only. It should not be enabled in production as it could expose sensitive information. The logger is automatically disabled in production mode. 