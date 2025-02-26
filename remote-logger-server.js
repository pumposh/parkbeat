/**
 * Remote Logger Server
 * 
 * A simple Express server that receives logs from the remote logger
 * and displays them in the browser.
 * 
 * Usage:
 * 1. Run this server: node remote-logger-server.js
 * 2. Open http://localhost:3030 in your browser
 * 3. Initialize the remote logger in your app with the server URL
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Enable CORS for all routes
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Store connected clients
const clients = new Set();

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  clients.add(ws);

  ws.on('close', () => {
    console.log('Client disconnected from WebSocket');
    clients.delete(ws);
  });
});

// Endpoint to receive logs
app.post('/logs', (req, res) => {
  const logData = req.body;
  
  // Broadcast logs to all connected WebSocket clients
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(logData));
    }
  });
  
  res.status(200).send({ success: true });
});

// Serve the HTML page for the log viewer
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Remote Logger Viewer</title>
      <style>
        :root {
          --bg-primary: #f5f5f5;
          --bg-secondary: #ffffff;
          --bg-tertiary: #f8f9fa;
          --text-primary: #333333;
          --text-secondary: #666666;
          --header-bg: #2c3e50;
          --header-text: #ffffff;
          --btn-primary: #3498db;
          --btn-primary-hover: #2980b9;
          --btn-danger: #f44336;
          --btn-success: #4caf50;
          --btn-disabled: #cccccc;
          --border-color: #e0e0e0;
          --shadow-color: rgba(0,0,0,0.1);
          --log-info: #e3f2fd;
          --log-warn: #fff3e0;
          --log-error: #ffebee;
          --log-debug: #f3e5f5;
          --log-log: #f8f9fa;
        }

        [data-theme="dark"] {
          --bg-primary: #121212;
          --bg-secondary: #1e1e1e;
          --bg-tertiary: #2d2d2d;
          --text-primary: #e0e0e0;
          --text-secondary: #a0a0a0;
          --header-bg: #1a1a2e;
          --header-text: #ffffff;
          --btn-primary: #2979ff;
          --btn-primary-hover: #2962ff;
          --btn-danger: #f44336;
          --btn-success: #4caf50;
          --btn-disabled: #555555;
          --border-color: #444444;
          --shadow-color: rgba(0,0,0,0.3);
          --log-info: #0d47a1;
          --log-warn: #e65100;
          --log-error: #b71c1c;
          --log-debug: #4a148c;
          --log-log: #212121;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          margin: 0;
          padding: 0;
          background-color: var(--bg-primary);
          color: var(--text-primary);
          transition: background-color 0.3s ease, color 0.3s ease;
        }
        
        header {
          background-color: var(--header-bg);
          color: var(--header-text);
          padding: 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        h1 {
          margin: 0;
          font-size: 1.5rem;
        }
        
        .controls {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        
        button {
          background-color: var(--btn-primary);
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        
        button:hover {
          background-color: var(--btn-primary-hover);
        }
        
        #log-container {
          padding: 1rem;
          height: calc(100vh - 80px);
          overflow-y: auto;
          background-color: var(--bg-secondary);
          border-radius: 4px;
          box-shadow: 0 1px 3px var(--shadow-color);
          margin: 1rem;
        }
        
        .log-entry {
          margin-bottom: 0.5rem;
          padding: 0.5rem;
          border-radius: 4px;
          font-family: monospace;
          white-space: pre-wrap;
          word-break: break-word;
          color: var(--text-primary);
          border: 1px solid transparent;
        }
        
        .log-entry.log { background-color: var(--log-log); }
        .log-entry.info { background-color: var(--log-info); }
        .log-entry.warn { background-color: var(--log-warn); }
        .log-entry.error { background-color: var(--log-error); }
        .log-entry.debug { background-color: var(--log-debug); }
        
        .timestamp {
          color: var(--text-secondary);
          font-size: 0.8rem;
          margin-right: 0.5rem;
        }
        
        .device-info {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-bottom: 1rem;
          padding: 0.5rem;
          background-color: var(--bg-tertiary);
          border-radius: 4px;
        }
        
        .connection-status {
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.8rem;
        }
        
        .connection-status.connected {
          background-color: var(--btn-success);
          color: white;
        }
        
        .connection-status.disconnected {
          background-color: var(--btn-danger);
          color: white;
        }
        
        .theme-toggle {
          display: flex;
          align-items: center;
          margin-right: 10px;
        }
        
        .theme-toggle-switch {
          position: relative;
          display: inline-block;
          width: 50px;
          height: 24px;
        }
        
        .theme-toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        
        .theme-toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #ccc;
          transition: .4s;
          border-radius: 24px;
        }
        
        .theme-toggle-slider:before {
          position: absolute;
          content: "";
          height: 16px;
          width: 16px;
          left: 4px;
          bottom: 4px;
          background-color: white;
          transition: .4s;
          border-radius: 50%;
        }
        
        input:checked + .theme-toggle-slider {
          background-color: #2196F3;
        }
        
        input:checked + .theme-toggle-slider:before {
          transform: translateX(26px);
        }
        
        .theme-toggle-icon {
          margin: 0 5px;
          font-size: 14px;
        }
        
        .filter-controls {
          display: flex;
          gap: 8px;
          margin-bottom: 10px;
          flex-wrap: wrap;
        }
        
        .filter-button {
          padding: 4px 8px;
          font-size: 12px;
          border-radius: 4px;
          background-color: var(--bg-tertiary);
          color: var(--text-primary);
          border: 1px solid var(--border-color);
          cursor: pointer;
        }
        
        .filter-button.active {
          background-color: var(--btn-primary);
          color: white;
          border-color: var(--btn-primary);
        }
        
        .toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 1rem 0.5rem 1rem;
          border-bottom: 1px solid var(--border-color);
          margin-bottom: 0.5rem;
        }
        
        .search-box {
          padding: 4px 8px;
          border-radius: 4px;
          border: 1px solid var(--border-color);
          background-color: var(--bg-tertiary);
          color: var(--text-primary);
        }
        
        .search-box::placeholder {
          color: var(--text-secondary);
        }
      </style>
    </head>
    <body>
      <header>
        <h1>Remote Logger Viewer</h1>
        <div class="controls">
          <div class="theme-toggle">
            <span class="theme-toggle-icon">☀️</span>
            <label class="theme-toggle-switch">
              <input type="checkbox" id="theme-toggle-input">
              <span class="theme-toggle-slider"></span>
            </label>
            <span class="theme-toggle-icon">🌙</span>
          </div>
          <span id="connection-status" class="connection-status disconnected">Disconnected</span>
          <button id="clear-logs">Clear Logs</button>
        </div>
      </header>
      
      <div class="toolbar">
        <div class="filter-controls">
          <button class="filter-button active" data-level="all">All</button>
          <button class="filter-button" data-level="log">Log</button>
          <button class="filter-button" data-level="info">Info</button>
          <button class="filter-button" data-level="warn">Warn</button>
          <button class="filter-button" data-level="error">Error</button>
          <button class="filter-button" data-level="debug">Debug</button>
        </div>
        <input type="text" class="search-box" id="search-input" placeholder="Search logs...">
      </div>
      
      <div id="log-container"></div>
      
      <script>
        const logContainer = document.getElementById('log-container');
        const clearLogsButton = document.getElementById('clear-logs');
        const connectionStatus = document.getElementById('connection-status');
        const themeToggleInput = document.getElementById('theme-toggle-input');
        const filterButtons = document.querySelectorAll('.filter-button');
        const searchInput = document.getElementById('search-input');
        
        let ws;
        let allLogs = [];
        let activeFilter = 'all';
        let searchTerm = '';
        
        // Theme handling
        function setTheme(isDark) {
          document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
          localStorage.setItem('remote-logger-theme', isDark ? 'dark' : 'light');
        }
        
        // Initialize theme from localStorage
        const savedTheme = localStorage.getItem('remote-logger-theme');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const initialDarkMode = savedTheme === 'dark' || (savedTheme === null && prefersDark);
        
        setTheme(initialDarkMode);
        themeToggleInput.checked = initialDarkMode;
        
        // Theme toggle event listener
        themeToggleInput.addEventListener('change', (e) => {
          setTheme(e.target.checked);
        });
        
        // Filter logs
        function filterLogs() {
          const filteredLogs = allLogs.filter(log => {
            const levelMatch = activeFilter === 'all' || log.level === activeFilter;
            const searchMatch = !searchTerm || 
              log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
              (log.data && log.data.some(item => 
                String(item).toLowerCase().includes(searchTerm.toLowerCase())
              ));
            return levelMatch && searchMatch;
          });
          
          renderLogs(filteredLogs);
        }
        
        // Filter button event listeners
        filterButtons.forEach(button => {
          button.addEventListener('click', () => {
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            activeFilter = button.dataset.level;
            filterLogs();
          });
        });
        
        // Search input event listener
        searchInput.addEventListener('input', (e) => {
          searchTerm = e.target.value;
          filterLogs();
        });
        
        function connectWebSocket() {
          ws = new WebSocket('ws://' + window.location.host);
          
          ws.onopen = () => {
            console.log('Connected to WebSocket server');
            connectionStatus.textContent = 'Connected';
            connectionStatus.className = 'connection-status connected';
          };
          
          ws.onclose = () => {
            console.log('Disconnected from WebSocket server');
            connectionStatus.textContent = 'Disconnected';
            connectionStatus.className = 'connection-status disconnected';
            
            // Try to reconnect after 3 seconds
            setTimeout(connectWebSocket, 3000);
          };
          
          ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            processLogData(data);
          };
        }
        
        function processLogData(data) {
          // Display device info if available
          if (data.device) {
            const deviceInfoEl = document.createElement('div');
            deviceInfoEl.className = 'device-info';
            deviceInfoEl.textContent = \`Device: \${data.device.userAgent} (\${data.device.platform})\`;
            logContainer.appendChild(deviceInfoEl);
          }
          
          // Store and display logs
          if (data.logs && Array.isArray(data.logs)) {
            allLogs = [...allLogs, ...data.logs];
            filterLogs();
          }
        }
        
        function renderLogs(logs) {
          // Clear existing logs
          logContainer.innerHTML = '';
          
          // Display logs
          logs.forEach(log => {
            const logEntry = document.createElement('div');
            logEntry.className = \`log-entry \${log.level}\`;
            
            const timestamp = new Date(log.timestamp).toISOString().split('T')[1].slice(0, -1);
            const timestampEl = document.createElement('span');
            timestampEl.className = 'timestamp';
            timestampEl.textContent = timestamp;
            
            logEntry.appendChild(timestampEl);
            
            const messageEl = document.createElement('span');
            messageEl.textContent = log.message;
            logEntry.appendChild(messageEl);
            
            // Add data if available
            if (log.data && log.data.length > 0) {
              const dataText = log.data.map(item => {
                try {
                  return typeof item === 'object' ? JSON.stringify(item, null, 2) : item;
                } catch (e) {
                  return String(item);
                }
              }).join(' ');
              
              if (dataText.trim()) {
                const dataEl = document.createElement('div');
                dataEl.textContent = dataText;
                logEntry.appendChild(dataEl);
              }
            }
            
            logContainer.appendChild(logEntry);
          });
          
          // Scroll to bottom
          logContainer.scrollTop = logContainer.scrollHeight;
        }
        
        // Clear logs button
        clearLogsButton.addEventListener('click', () => {
          allLogs = [];
          logContainer.innerHTML = '';
        });
        
        // Connect to WebSocket server
        connectWebSocket();
      </script>
    </body>
    </html>
  `);
});

// Start the server
const PORT = process.env.PORT || 3030;
server.listen(PORT, () => {
  console.log(`Remote Logger Server running at http://localhost:${PORT}`);
}); 