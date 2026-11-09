#!/usr/bin/env bash
#
# Backs up the Postgres database used by docker-compose.prod.yml.
# Run manually, or on a schedule - see the cron example at the bottom of
# this file and in DEPLOYMENT.md.
#
# What this does:
#   1. pg_dump the database (from inside the running postgres container,
#      so it works identically whether you run this on the VM itself or
#      from a jump box with docker context configured).
#   2. Compress it.
#   3. Keep the last KEEP_DAILY local copies, delete older ones.
#   4. If AWS_* env vars are set (any S3-compatible provider works -
#      Backblaze B2, DigitalOcean Spaces, Cloudflare R2, real AWS S3),
#      also push a copy off the VM. A backup that lives only on the same
#      disk as the database is not a real backup.
#
# Usage:
#   ./scripts/backup.sh
#
# Required env (source your .env.production or export these first):
#   DB_USERNAME, DB_PASSWORD, DB_NAME
# Optional, for off-server copies:
#   BACKUP_S3_BUCKET, BACKUP_S3_ENDPOINT (only if not real AWS),
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAILY="${KEEP_DAILY:-14}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
FILENAME="emi_corehub-${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "Dumping database ${DB_NAME}..."
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$DB_USERNAME" "$DB_NAME" | gzip > "${BACKUP_DIR}/${FILENAME}"

SIZE=$(du -h "${BACKUP_DIR}/${FILENAME}" | cut -f1)
echo "Wrote ${BACKUP_DIR}/${FILENAME} (${SIZE})"

# Rotate: keep only the most recent KEEP_DAILY local backups.
ls -1t "${BACKUP_DIR}"/emi_corehub-*.sql.gz 2>/dev/null | tail -n +$((KEEP_DAILY + 1)) | xargs -r rm --
echo "Local backups kept: $(ls -1 "${BACKUP_DIR}"/emi_corehub-*.sql.gz 2>/dev/null | wc -l)"

# Off-server copy - only runs if you've configured an S3-compatible target.
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  if ! command -v aws >/dev/null 2>&1; then
    echo "WARNING: BACKUP_S3_BUCKET is set but the aws CLI isn't installed - skipping off-server copy." >&2
  else
    ENDPOINT_ARG=""
    if [ -n "${BACKUP_S3_ENDPOINT:-}" ]; then
      ENDPOINT_ARG="--endpoint-url=${BACKUP_S3_ENDPOINT}"
    fi
    aws s3 cp "${BACKUP_DIR}/${FILENAME}" "s3://${BACKUP_S3_BUCKET}/${FILENAME}" $ENDPOINT_ARG
    echo "Uploaded to s3://${BACKUP_S3_BUCKET}/${FILENAME}"
  fi
else
  echo "NOTE: no BACKUP_S3_BUCKET configured - this backup only exists on this VM's disk."
  echo "      That means a disk failure or a bad 'docker system prune' can still lose everything."
fi

# --- Example crontab entry (run: crontab -e) ---
# Daily at 2:15am, using this repo's checked-out path:
#   15 2 * * * cd /opt/emi-corehub && set -a && . ./.env.production && set +a && ./scripts/backup.sh >> /var/log/emi-backup.log 2>&1
