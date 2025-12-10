#!/bin/sh
set -e

echo "Running database migrations..."
node dist/run-migrations.js

echo "Starting application..."
exec node dist/main

