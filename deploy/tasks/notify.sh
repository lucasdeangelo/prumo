#!/bin/sh
# Daily reminders: the same endpoint Vercel Cron would call.
. /run/tasks.env
curl -fsS --max-time 60 -H "Authorization: Bearer ${CRON_SECRET}" "${APP_INTERNAL_URL}/api/cron/notifications" \
  && echo " notifications ok $(date -Iseconds)" \
  || echo "notifications failed $(date -Iseconds)" >&2
