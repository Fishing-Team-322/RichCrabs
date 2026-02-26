#!/bin/sh
set -eu

if [ ! -d /migrations ]; then
  echo "[init] /migrations directory not found, skipping migrations"
  exit 0
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "[init] psql is not available in the postgres container"
  exit 1
fi

migration_count=0
for file in /migrations/*.sql; do
  if [ ! -f "$file" ]; then
    break
  fi

  migration_count=$((migration_count + 1))
  echo "[init] applying migration $(basename "$file")"
  psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --file "$file"
done

if [ "$migration_count" -eq 0 ]; then
  echo "[init] no migration files found in /migrations"
fi
