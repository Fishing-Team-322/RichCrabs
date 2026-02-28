#!/bin/sh
set -eu

if [ ! -d /migrations ]; then
  echo "[migrate] /migrations directory not found"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "[migrate] psql is not available"
  exit 1
fi

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"

psql_base="psql --username $POSTGRES_USER --dbname $POSTGRES_DB --host $PGHOST --port $PGPORT --set ON_ERROR_STOP=1"

$psql_base <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

migration_count=0
applied_count=0
for file in /migrations/*.sql; do
  if [ ! -f "$file" ]; then
    break
  fi

  migration_count=$((migration_count + 1))
  filename="$(basename "$file")"
  already_applied="$($psql_base --tuples-only --no-align --command "SELECT 1 FROM schema_migrations WHERE filename='${filename}'")"

  if [ "$already_applied" = "1" ]; then
    echo "[migrate] skipping already applied migration $filename"
    continue
  fi

  echo "[migrate] applying migration $filename"
  $psql_base --single-transaction --file "$file"
  $psql_base --command "INSERT INTO schema_migrations (filename) VALUES ('${filename}')"
  applied_count=$((applied_count + 1))
done

if [ "$migration_count" -eq 0 ]; then
  echo "[migrate] no migration files found in /migrations"
else
  echo "[migrate] applied $applied_count of $migration_count migration(s)"
fi
