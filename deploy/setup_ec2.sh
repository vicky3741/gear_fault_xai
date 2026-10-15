#!/usr/bin/env bash
# One-time setup of an EC2 instance (Ubuntu 22.04: python3.10 is the default there).
#
# Copy the project to /opt/gear-xai first (see README "AWS deployment"), then run:
#   sudo bash /opt/gear-xai/deploy/setup_ec2.sh
#
# Safe to re-run. It does not start a retrain and does not touch the S3 bucket.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/gear-xai}"
APP_USER="${APP_USER:-ubuntu}"
ENV_FILE=/etc/gear-xai.env
LOG_DIR=/var/log/gear-xai

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo bash $0" >&2
  exit 1
fi
if [ ! -f "$APP_DIR/requirements.txt" ]; then
  echo "No requirements.txt in $APP_DIR. Copy the project there first." >&2
  exit 1
fi

echo "[setup] system packages"
apt-get update -y
apt-get install -y --no-install-recommends \
  python3.10 python3.10-venv python3-pip curl unzip libgomp1 libglib2.0-0 libgl1

echo "[setup] AWS CLI v2 (used by retrain.sh to upload results and models)"
if ! command -v aws >/dev/null 2>&1; then
  curl -sSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
  unzip -q -o /tmp/awscliv2.zip -d /tmp
  /tmp/aws/install --update
fi

echo "[setup] folders"
mkdir -p "$APP_DIR/models" "$APP_DIR/results" "$APP_DIR/data/processed" "$APP_DIR/data/time_domain" "$LOG_DIR"

echo "[setup] python virtualenv and requirements"
if [ ! -d "$APP_DIR/venv" ]; then
  python3.10 -m venv "$APP_DIR/venv"
fi
"$APP_DIR/venv/bin/pip" install --upgrade pip
"$APP_DIR/venv/bin/pip" install -r "$APP_DIR/requirements.txt"

chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$LOG_DIR"
chmod +x "$APP_DIR"/deploy/*.sh

echo "[setup] environment file $ENV_FILE"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<'EOF'
# Read by the gear-xai service and by deploy/retrain.sh.
# Fill in the two values below, then run: sudo systemctl restart gear-xai
S3_BUCKET=
AWS_REGION=
EOF
  chown root:"$APP_USER" "$ENV_FILE"
  chmod 640 "$ENV_FILE"
fi

echo "[setup] systemd service (starts on boot, restarts on failure)"
sed -e "s|/opt/gear-xai|$APP_DIR|g" -e "s|^User=ubuntu|User=$APP_USER|" -e "s|^Group=ubuntu|Group=$APP_USER|" \
  "$APP_DIR/deploy/gear-xai.service" > /etc/systemd/system/gear-xai.service
systemctl daemon-reload
systemctl enable --now gear-xai

echo "[setup] done"
echo "  1. sudo nano $ENV_FILE          (set S3_BUCKET and AWS_REGION)"
echo "  2. sudo -u $APP_USER bash $APP_DIR/deploy/sync_dataset.sh   (copy the dataset from S3)"
echo "  3. sudo systemctl restart gear-xai"
echo "  4. journalctl -u gear-xai -f    (logs)"
