#!/bin/sh
# A container restart leaves Chromium's profile locks behind; with them the browser refuses to
# open the saved WhatsApp session.
set -e
find "${WHATSAPP_SESSION_PATH:-/data/session}" -maxdepth 3 -name 'Singleton*' -exec rm -f {} + 2>/dev/null || true
exec "$@"
