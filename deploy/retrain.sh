#!/usr/bin/env bash
# Retrain the 3-model time-domain ensemble from the S3 dataset, then publish models/ and results/ to S3.
#
# WARNING: src.train_meta_td overwrites models/time_domain/ and results/ in APP_DIR. The dashboard keeps
# using the old models until the service restarts.
#
# NOT scheduled. To schedule it, run `crontab -e` as the app user and add this line:
#   # 30 2 * * 0  /opt/gear-xai/deploy/retrain.sh >> /var/log/gear-xai/retrain.log 2>&1
#
# After a retrain, restart the dashboard so it loads the new models:
#   sudo systemctl restart gear-xai
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

REGION_ARG=()
if [ -n "${AWS_REGION:-}" ]; then
  REGION_ARG=(--region "$AWS_REGION")
fi

export TIME_DOMAIN_DIR="${TIME_DOMAIN_DIR:-$APP_DIR/data/time_domain}"
export TF_CPP_MIN_LOG_LEVEL=2
export PYTHONUNBUFFERED=1

cd "$APP_DIR"

echo "[retrain] $(date -Is) syncing dataset from S3 (bucket $S3_BUCKET)"
bash "$APP_DIR/deploy/sync_dataset.sh"

# The EMD caches are built from the dataset. Delete them so they match the copy just synced.
rm -f data/processed/newdata_2ch_denoise.npz data/processed/newdata_denoise.npz

echo "[retrain] $(date -Is) training the 3-model ensemble"
"$APP_DIR/venv/bin/python" -m src.train_meta_td
"$APP_DIR/venv/bin/python" -m src.shap_explain --dataset time_domain

echo "[retrain] $(date -Is) publishing models/ and results/"
aws s3 sync models/ "s3://$S3_BUCKET/${S3_MODEL_PREFIX:-models/}" "${REGION_ARG[@]}"
aws s3 sync results/ "s3://$S3_BUCKET/results/" "${REGION_ARG[@]}"

echo "[retrain] $(date -Is) done"
