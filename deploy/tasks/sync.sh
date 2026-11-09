#!/bin/sh
# Imports bank data that is newer at Pluggy than in Prumo (no-op when nothing changed).
. /run/tasks.env
out=$(curl -fsS --max-time 280 -H "Authorization: Bearer ${CRON_SECRET}" "${APP_INTERNAL_URL}/api/cron/sync") \
  && echo "sync $out $(date -Iseconds)" \
  || echo "sync failed $(date -Iseconds)" >&2
