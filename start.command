#!/bin/bash
# Double-click to start the Gower websites locally.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed."
  echo "Please install the LTS version from https://nodejs.org and then run this again."
  read -p "Press Enter to close..."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Setting up (first run only)…"
  npm install || { read -p "Setup failed. Press Enter to close..."; exit 1; }
fi
( sleep 2; open "http://localhost:3000/living" ) &
echo "Starting Gower websites… (close this window to stop)"
npm start
