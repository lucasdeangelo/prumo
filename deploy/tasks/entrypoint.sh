#!/bin/sh
# crond starts jobs with an empty environment: keep what they need in a root-only file.
set -e
umask 077
{
  echo "export TZ='${TZ:-America/Sao_Paulo}'"
  echo "export CRON_SECRET='${CRON_SECRET}'"
  echo "export APP_INTERNAL_URL='${APP_INTERNAL_URL:-http://app:3000}'"
  echo "export SUPABASE_DB_URL='${SUPABASE_DB_URL}'"
  echo "export BACKUP_KEEP_DAYS='${BACKUP_KEEP_DAYS:-14}'"
} > /run/tasks.env
exec "$@"
