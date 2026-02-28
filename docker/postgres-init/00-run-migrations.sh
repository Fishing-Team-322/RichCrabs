#!/bin/sh
set -eu

PGHOST=127.0.0.1 /docker-entrypoint-initdb.d/run-migrations.sh
