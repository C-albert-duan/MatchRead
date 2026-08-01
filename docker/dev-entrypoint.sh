#!/bin/sh
set -e
cd /app
if [ ! -d node_modules/next ]; then
  echo "Installing workspace dependencies inside container..."
  npm ci
fi
exec "$@"
