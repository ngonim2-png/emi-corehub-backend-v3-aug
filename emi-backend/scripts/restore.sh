#!/usr/bin/env bash
#
# Restores a backup produced by backup.sh. THIS OVERWRITES THE CURRENT
# DATABASE - it asks for explicit confirmation before doing anything
# destructive, and that confirmation is not optional.
#
# Usage:
#   ./scripts/restore.sh ./backups/emi_corehub-20260725-021500.sql.gz
#
# If you downloaded the backup from S3-compatible storage instead of
# using a local one, download it first, then point this at the local file.

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <path-to-backup.sql.gz>" >&2
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "File not found: $BACKUP_FILE" >&2
  exit 1
fi

echo "This will DROP and recreate database '${DB_NAME}' and restore it from:"
echo "  ${BACKUP_FILE}"
echo
echo "Everything currently in that database will be permanently lost."
read -r -p "Type the database name (${DB_NAME}) to confirm: " CONFIRM
if [ "$CONFIRM" != "${DB_NAME}" ]; then
  echo "Confirmation did not match - aborted, nothing was changed."
  exit 1
fi

echo "Dropping and recreating ${DB_NAME}..."
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U "$DB_USERNAME" -d postgres -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";"
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U "$DB_USERNAME" -d postgres -c "CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USERNAME}\";"

echo "Restoring..."
gunzip -c "$BACKUP_FILE" | docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U "$DB_USERNAME" -d "$DB_NAME"

echo "Restore complete. Restart the API so it reconnects cleanly:"
echo "  docker compose -f docker-compose.prod.yml restart api"
