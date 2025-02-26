## Parkbeat

<p align="center">
  <img src="./public/parkbeat-0.png" alt="Parkbeat Logo" width="200" height="auto">
</p>


A simple webapp for community engagement in local parks.

## Development

Run the client and remote logger in development mode:

```bash
npm run dev
```

This will start both the Next.js app and the remote logger server concurrently.

Alternatively, you can run them separately:

```bash
# Run only the Next.js app
npm run dev:app

# Run only the remote logger server
npm run dev:logger
```

Run the server in development mode:

```bash
bunx wrangler dev
```

## Remote Logger

The project includes a remote logging utility that allows you to view console logs from your iOS simulator (or any mobile device) in a browser window. This is particularly useful for debugging mobile applications where accessing the console directly can be challenging.

### Setup

Run the setup script to install the required dependencies:

```bash
# Make the script executable
chmod +x setup-remote-logger.sh

# Run the setup script
./setup-remote-logger.sh
```

### Usage

1. Start the development environment with `npm run dev`
2. Access the remote logger at http://localhost:3030
3. Run your app in the iOS simulator
4. All console logs will appear in the browser window

For more details, see [REMOTE_LOGGER.md](./REMOTE_LOGGER.md).

## Deployment

```bash
bunx wrangler deploy
```
