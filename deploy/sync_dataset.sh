#!/usr/bin/env bash
# Copy the time-domain dataset from S3 into the server's data folder (TIME_DOMAIN_DIR).
# The dashboard and the training code read that folder; they never read S3 directly.
#
# Run on the EC2 server as the app user (needs S3_BUCKET in /etc/gear-xai.env):
#   bash /opt/gear-xai/deploy/sync_dataset.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/gear-xai}"
ENV_FILE=/etc/gear-xai.env

# Load S3_BUCKET / AWS_REGION (cron does not read the service's environment file)
if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi
: "${S3_BUCKET:?S3_BUCKET is not set. Put it in $ENV_FILE}"

S3_RAW_PREFIX="${S3_RAW_PREFIX:-raw/time domain/}"
TIME_DOMAIN_DIR="${TIME_DOMAIN_DIR:-$APP_DIR/data/time_domain}"

REGION_ARG=()
if [ -n "${AWS_REGION:-}" ]; then
  REGION_ARG=(--region "$AWS_REGION")
fi

mkdir -p "$TIME_DOMAIN_DIR"
echo "[sync] s3://$S3_BUCKET/$S3_RAW_PREFIX -> $TIME_DOMAIN_DIR"
aws s3 sync "s3://$S3_BUCKET/$S3_RAW_PREFIX" "$TIME_DOMAIN_DIR" "${REGION_ARG[@]}"
echo "[sync] $(find "$TIME_DOMAIN_DIR" -name '*.xlsx' | wc -l) .xlsx files in $TIME_DOMAIN_DIR"
