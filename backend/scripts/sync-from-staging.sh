#!/bin/bash

# Sync local dev database from staging
# Usage: ./scripts/sync-from-staging.sh

set -e

# Load environment variables from .env
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "Error: .env file not found"
    exit 1
fi

# Validate required environment variables
required_vars=(
    "POSTGRES_HOST" "POSTGRES_PORT" "POSTGRES_DB" "POSTGRES_USER" "POSTGRES_PASSWORD"
    "STAGE_DB_HOST" "STAGE_DB_PORT" "STAGE_DB_NAME" "STAGE_DB_USER" "STAGE_DB_PASSWORD"
)

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "Error: $var is not set"
        exit 1
    fi
done

echo "=== Database Sync from Staging ==="
echo "Source: ${STAGE_DB_HOST}:${STAGE_DB_PORT}/${STAGE_DB_NAME}"
echo "Target: ${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"
echo ""

# Confirm with user
read -p "This will DELETE all data in the local database. Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Create temp file for dump
DUMP_FILE=$(mktemp)
trap "rm -f $DUMP_FILE" EXIT

echo "1. Dumping data from staging..."
PGPASSWORD="$STAGE_DB_PASSWORD" pg_dump \
    -h "$STAGE_DB_HOST" \
    -p "$STAGE_DB_PORT" \
    -U "$STAGE_DB_USER" \
    -d "$STAGE_DB_NAME" \
    --data-only \
    --disable-triggers \
    -F c \
    -f "$DUMP_FILE"

echo "2. Clearing local database tables..."
# Get all tables in public schema and truncate them
TABLES=$(PGPASSWORD="$POSTGRES_PASSWORD" psql \
    -h "$POSTGRES_HOST" \
    -p "$POSTGRES_PORT" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -t -c "SELECT string_agg('\"' || tablename || '\"', ', ') FROM pg_tables WHERE schemaname = 'public';")

if [ -n "$TABLES" ] && [ "$TABLES" != " " ]; then
    PGPASSWORD="$POSTGRES_PASSWORD" psql \
        -h "$POSTGRES_HOST" \
        -p "$POSTGRES_PORT" \
        -U "$POSTGRES_USER" \
        -d "$POSTGRES_DB" \
        -c "TRUNCATE TABLE $TABLES CASCADE;"
else
    echo "   No tables found to truncate"
fi

echo "3. Restoring data to local database..."
PGPASSWORD="$POSTGRES_PASSWORD" pg_restore \
    -h "$POSTGRES_HOST" \
    -p "$POSTGRES_PORT" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --data-only \
    --disable-triggers \
    "$DUMP_FILE"

echo ""
echo "=== Sync complete! ==="
