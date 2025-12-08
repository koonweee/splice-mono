#!/bin/sh
set -e

echo "Running database migrations..."
node node_modules/typeorm/cli.js migration:run -d dist/data-source.js

echo "Starting application..."
exec node dist/main

