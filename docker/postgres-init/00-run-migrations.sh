#!/usr/bin/env sh
set -eu

if [ ! -d /migrations ]; then
  echo "[init] /migrations directory not found, skipping migrations"
  exit 0
fi

for file in /migrations/*.sql; do
  if [ ! -f "$file" ]; then
    echo "[init] no migration files found"
    exit 0
  fi

  echo "[init] applying migration $(basename "$file")"
  psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --file "$file"
done
