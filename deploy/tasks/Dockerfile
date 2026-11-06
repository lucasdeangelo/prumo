# Scheduled jobs: daily notifications cron of the app and the database backup.
FROM alpine:3.21
RUN apk add --no-cache curl postgresql17-client tzdata
COPY crontab /etc/crontabs/root
COPY notify.sh backup.sh entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/notify.sh /usr/local/bin/backup.sh /usr/local/bin/entrypoint.sh
ENTRYPOINT ["entrypoint.sh"]
CMD ["crond", "-f", "-l", "6"]
