#!/bin/sh
# Plays infra's part locally: creates the role the app logs in as, the first time the volume is
# initialized (Postgres runs this only on an empty one). It owns nothing; the migration grants
# it what it needs, reading its name from APP_DB_USER.
set -eu

: "${APP_DB_USER:?APP_DB_USER is not set}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is not set}"

# psql variables, so psql itself quotes the name and the password.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v login="$APP_DB_USER" -v password="$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE :"login" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'password';
SQL
