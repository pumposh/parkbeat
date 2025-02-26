#!/bin/bash

# Setup Remote Logger for Parkbeat
echo "Setting up Remote Logger for Parkbeat..."

# Install required dependencies
echo "Installing required dependencies..."
pnpm install concurrently cors express ws

# Check if installation was successful
if [ $? -eq 0 ]; then
  echo "Dependencies installed successfully!"
  echo ""
  echo "You can now run the development environment with:"
  echo "npm run dev"
  echo ""
  echo "This will start both the Next.js app and the remote logger server."
  echo "Access the remote logger at: http://localhost:3030"
  echo ""
  echo "To start only the remote logger server:"
  echo "npm run dev:logger"
  echo ""
  echo "To start only the Next.js app:"
  echo "npm run dev:app"
else
  echo "Error installing dependencies. Please try again."
  exit 1
fi

# Ask if the user wants to start the development environment now
read -p "Do you want to start the development environment now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "Starting development environment..."
  npm run dev
fi 