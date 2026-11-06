#!/bin/sh
# Daily dump of the Supabase database (custom format, restorable with pg_restore).
. /run/tasks.env
set -e
if [ -z "$SUPABASE_DB_URL" ]; then
  echo "backup skipped: SUPABASE_DB_URL not set" >&2
  exit 0
fi
file="/backups/prumo-$(date +%Y-%m-%d).dump"
pg_dump --format=custom --no-owner --no-privileges --schema=public --schema=auth --file="$file.partial" "$SUPABASE_DB_URL"
mv "$file.partial" "$file"
find /backups -name 'prumo-*.dump' -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
echo "backup ok $file $(du -h "$file" | cut -f1)"
