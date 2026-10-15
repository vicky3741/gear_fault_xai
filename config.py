"""
Central configuration for the Gear Fault Severity + XAI project (time-domain dataset).
Edit paths/params here only. All modules import from this file.
"""
import os


# ----- paths -----
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(PROJECT_DIR, "results")
FIG_DIR = os.path.join(RESULTS_DIR, "figures")
TAB_DIR = os.path.join(RESULTS_DIR, "tables")
METRIC_DIR = os.path.join(RESULTS_DIR, "metrics")
XAI_DIR = os.path.join(RESULTS_DIR, "xai")
MODEL_DIR = os.path.join(PROJECT_DIR, "models")
PROC_DIR = os.path.join(PROJECT_DIR, "data", "processed")

# Time-domain dataset: <Position N>/<class>/<rpm>_<load>_<cond>_p{1,2}.xlsx
# Default is the "time domain" folder next to this project (Desktop\time domain).
# Set the TIME_DOMAIN_DIR environment variable to point somewhere else (for example on EC2).
TIME_DOMAIN_DIR = (os.environ.get("TIME_DOMAIN_DIR", "").strip()
                   or os.path.join(os.path.dirname(PROJECT_DIR), "time domain"))

# AWS: the app never talks to S3. deploy/sync_dataset.sh copies the dataset to TIME_DOMAIN_DIR.
# Region used for SMS alerts (boto3 default chain supplies the credentials).
AWS_REGION = os.environ.get("AWS_REGION", "").strip() or None

# ----- admin SMS alerts (api/alerts.py) -----
# Alerts are OFF while ALERT_PHONE is empty. Keep the phone number in /etc/gear-xai.env, not in code.
MACHINE_NAME = os.environ.get("MACHINE_NAME", "").strip() or "Gear compressor"
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()  # from @BotFather
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "").strip()      # the admin's chat with the bot
ALERT_PHONE = os.environ.get("ALERT_PHONE", "").strip()          # SMS fallback (AWS SNS), e.g. +91XXXXXXXXXX
ALERT_SENDER_ID = os.environ.get("ALERT_SENDER_ID", "").strip()  # DLT-registered sender ID (India), optional

# ----- windowing / model input -----
WINDOW = 512                 # window length (FFT bins are derived from it in src/newdata_push.py)

# ----- augmentation (TRAIN ONLY - val/test stay untouched, no leakage) -----
AUG_COPIES = 4               # augmented copies per original train window
AUG_NOISE = 0.10             # gaussian noise std (normalised space)
AUG_SCALE = 0.10             # +/- amplitude scaling range

# ----- training -----
EPOCHS = 60
BATCH = 16
LR = 1e-3

for d in (FIG_DIR, TAB_DIR, METRIC_DIR, XAI_DIR, MODEL_DIR, PROC_DIR):
    os.makedirs(d, exist_ok=True)
