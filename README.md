# Bearing Fault Detection & Severity Classification with Explainable AI

A vibration-based predictive-maintenance system. It reads a short vibration recording of a
machine and tells you the machine's health as one of five levels —
**Healthy, 25%, 50%, 75%, 100% fault** — and then **explains why**, using SHAP, by pointing to
the exact frequencies the model relied on. It uses a **3-model ensemble** (1D-CNN, CNN-BiLSTM and
LSAM-CNN-BiLSTM) and ships with a FastAPI backend and a React dashboard.

> This README is written so a teammate can clone the project and run, understand and extend it.

---

## 1. What problem are we solving?

A rolling/rotating machine (for example a compressor in a cold-storage plant) runs on parts whose
surfaces slowly wear or crack. A defect starts small and grows. While it grows, the **vibration
signature changes** in ways a human can't easily see. We want to:

1. **Detect** that a fault exists (Healthy vs Faulty), and
2. **Grade its severity** (25 / 50 / 75 / 100 %), and
3. **Explain** the decision so a maintenance engineer can trust it.

## 2. Why does a fault change the vibration? (plain language)

Each time the shaft turns, the moving part strikes the flaw once per cycle. This makes a tiny,
**repeated impact**. A bigger defect = bigger and more frequent impacts = **more vibration energy
at specific frequencies**. So:

| Condition | What is happening | Colour |
|---|---|---|
| **Healthy** | Smooth running, no fault frequency stands out | 🟢 green `#2e7d32` |
| **25% fault** | Small defect just started; weak high-frequency knocks, hard to feel | 🟡 yellow `#f9a825` |
| **50% fault** | Defect grown; stronger, regular impacts, clear extra energy in fault bands | 🟠 amber `#f57f17` |
| **75% fault** | Advanced; large sharp impacts each turn; rough, broad vibration | 🟧 orange `#ef6c00` |
| **100% fault** | Fully developed; very strong broadband vibration, big peaks; failure near | 🔴 red `#c62828` |

The model learns these frequency patterns from the **FFT spectrum**, and **SHAP** shows which
frequency bands it used. SHAP tells us *what the model relied on* — it is **not** a proof of the
physical defect location, and the maintenance text is **guidance, not a rule**.

## 3. The method (what actually runs)

```
vibration file (2 channels: sensor p1 + p2)
  │
  ├─ normalise               (per channel)
  ├─ EMD denoise             (Empirical Mode Decomposition; drop the 1st IMF = high-freq noise)
  ├─ window                  (256 samples, stride 32 → 87.5% overlap; train/test regions disjoint)
  ├─ FFT magnitude           (rfft, divided by N → amplitude spectrum, 129 bins)
  ├─ standardise             (using TRAINING statistics only — no leakage)
  │
  ├─► 1D-CNN ─┐
  ├─► CNN-BiLSTM ─┤ average softmax  = META ensemble
  └─► LSAM-CNN-BiLSTM ─┘
  │
  ├─ per-recording voting    (average the ensemble probabilities over all windows of the file)
  └─► predicted class + confidence  +  SHAP explanation (which frequencies mattered)
```

**Leakage-safe:** training windows come from one time-region of each recording and test windows
from a different region, so they never share samples. This keeps the accuracy honest.

**The three models**
- **1D-CNN** — learns local frequency patterns with convolution filters.
- **CNN-BiLSTM** — adds a bidirectional LSTM that reads the feature sequence both ways.
- **LSAM-CNN-BiLSTM** — adds a Lightweight Subspace Attention Module (splits feature channels into
  subspaces and re-weights the informative ones) before the BiLSTM.
- **META** — simply averages the three models' probabilities; different models make different
  mistakes, so averaging is more accurate and more stable.

## 4. Results (leakage-free, 117 paired recordings)

| Model | 5-class accuracy | Fault-vs-Healthy |
|---|---|---|
| 1D-CNN | 0.889 | 0.983 |
| CNN-BiLSTM | 0.880 | 0.974 |
| LSAM-CNN-BiLSTM | 0.863 | 0.983 |
| **META (3 models × 5 seeds, reference)** | **0.906** | **0.991** |
| **Deployed META (3 models × 1 seed)** | **0.863** | **0.966** |

The dashboard runs the **deployed** models saved in `models/time_domain/`. Every number shown in
the UI is read from a file in `results/`; nothing is invented.

## 5. Dataset

- Path is set by `TIME_DOMAIN_DIR` in `config.py`. Default: the `time domain` folder next to this project
  (`Desktop\time domain`). Layout:
  `<Position N>/<class>/<rpm>_<load>_<cond>_p{1,2}.xlsx`.
- Each file: 1024 samples; **column C** is the vibration signal (columns A,B are index/time).
- Sampling rate ≈ **2560 Hz**. 5 speeds (150–750 RPM) × 5 loads (0–400) × 2 sensor positions.
- The two positions of the same condition are **paired into a 2-channel sample** → 117 recordings,
  balanced across the five classes.

## 6. Setup & run

Requirements: **Python 3.10** and **Node ≥ 18**.

```bash
# python deps
pip install -r requirements.txt

# build the frontend once
cd frontend && npm install && npm run build && cd ..

# start everything (FastAPI serves the built UI + the API)
python run_dashboard.py            # open http://localhost:8000
```

**Development mode** (hot-reload UI):
```bash
# terminal 1 — API
python run_dashboard.py            # API on http://localhost:8000
# terminal 2 — UI
cd frontend && npm run dev         # UI on http://localhost:5173 (proxies /api → :8000)
```

**Retrain / regenerate** (optional):
```bash
python -m src.train_meta_td                       # train + save the 3 models
python -m src.shap_explain --dataset time_domain  # global SHAP + agreement → results/shap/
python -m pytest tests/                           # API tests (4 tests)
```

## 7. Code map (where to look)

| File / folder | What it does |
|---|---|
| `config.py` | paths and shared parameters |
| `src/newdata_loader.py` | loads the dataset (column C), pairs the positions |
| `src/newdata_2ch.py` | builds 2-channel samples + EMD denoise cache |
| `src/inference.py` | **the one place** that preprocesses + predicts (used by the API) |
| `src/model.py` / `model_cnn_bilstm.py` / `model_lsam_cnn_bilstm.py` | the three architectures |
| `src/train_meta_td.py` | trains the three models and saves them to `models/time_domain/` |
| `src/shap_explain.py` | global SHAP (GradientExplainer) + Gradient×Input agreement |
| `api/main.py` | FastAPI app and all endpoints |
| `api/io_utils.py` | read an upload / sample into a model-ready array; list samples |
| `api/explain.py` | per-recording SHAP + Gradient×Input, grouped into frequency bands |
| `api/db.py` | SQLite history of predictions |
| `api/report.py` | PDF report (prediction + probabilities + reason + guidance) |
| `frontend/src/App.tsx` | the whole dashboard UI (tabs, charts) |
| `frontend/src/api.ts` | typed API client |
| `models/time_domain/` | saved `cnn/cnnbilstm/lsam.keras`, `preproc.pkl`, `label_encoder.pkl`, `shap_background.npy` |
| `results/metrics|tables|shap|figures` | result files = the source of truth for the UI |

## 8. API endpoints

| Method & path | Purpose |
|---|---|
| `GET /health` | server + loaded models |
| `GET /datasets` | dataset, classes, class colours, model files |
| `GET /samples?dataset=` | list of recordings for the dropdown |
| `POST /predict` | file **or** `sample_id` → class, probabilities, per-window votes, confidence |
| `POST /explain` | SHAP + Gradient×Input for a recording → frequency-band importance, top-10, sentence |
| `GET /global-explanations?dataset=` | precomputed global SHAP (top bands per class, channel importance) |
| `GET /metrics?dataset=` | deployed META metrics + per-model comparison |
| `POST /batch` | many files → results table |
| `GET /history` · `DELETE /history/{id}` | stored predictions |
| `GET /report/{id}` | PDF report |

## 9. Dashboard tabs

**Live Diagnosis** (colour status card, 5-step severity bar, probability chart, per-window
timeline, **why-this-condition** reason, colour legend, maintenance guidance, PDF download) ·
**Explainability** (SHAP importance over frequency, top-10 bands, per-channel bar, target-class
selector, SHAP↔Gradient×Input toggle with agreement, plain sentence) · **Global Insights** ·
**Model Performance** · **Batch** · **History** · **Help**.

## 10. How to extend (for teammates)

- **Add a model:** write `build_model(input_len, n_channels, n_classes)` in a new `src/model_*.py`,
  add it to `BUILDERS` in `src/train_meta_td.py`, retrain. `inference.py` averages whatever
  `*.keras` files are in `models/time_domain/`, so the new model joins the ensemble automatically.
- **Change the pipeline** (window, stride, bands): edit `src/train_meta_td.py` and the matching
  values saved into `preproc.pkl`; `inference.py` reads them so training and inference stay in sync.
- **Add a dashboard view:** add a tab in `frontend/src/App.tsx` and, if needed, an endpoint in
  `api/main.py`. Rebuild with `npm run build`.

## 11. Limitations (be honest in the report)

- The dataset is of limited size, so neighbouring severities (e.g. 50 vs 75) are sometimes confused.
- Characteristic defect frequencies need the component geometry, which is not in the data, so we use
  a **general** frequency analysis rather than named fault frequencies.
- SHAP shows which frequencies the model used — **not** proof of a physical defect. Maintenance
  advice is **guidance, not a rule**.

## 12. AWS deployment (dataset in S3, dashboard on EC2)

The dataset and the trained models are kept in an S3 bucket. The EC2 server copies the dataset from S3
into a local folder, and the FastAPI + React dashboard runs on port 8000. The app never reads S3 itself.
It reads the folder named by `TIME_DOMAIN_DIR`.

Settings:

| Variable | Set in | Meaning |
|---|---|---|
| `S3_BUCKET` | `/etc/gear-xai.env` | bucket name. Required by the sync and retrain scripts |
| `AWS_REGION` | `/etc/gear-xai.env` | region of the bucket, e.g. `ap-south-1` |
| `TIME_DOMAIN_DIR` | `gear-xai.service` (already set) | folder the app reads: `/opt/gear-xai/data/time_domain` |
| `S3_RAW_PREFIX` | optional, for the scripts | where the dataset sits in the bucket. Default `raw/time domain/` |
| `S3_MODEL_PREFIX` | optional, for `retrain.sh` | where retrained models go. Default `models/` |

Files in `deploy/`: `setup_ec2.sh` (server setup), `gear-xai.service` (systemd unit, runs uvicorn on
port 8000), `upload_dataset.ps1` (Windows upload), `sync_dataset.sh` (S3 to server), `iam_policy.json`
(least-privilege policy), `retrain.sh` (optional retrain, not scheduled).

Do the steps in order. Replace `YOUR_BUCKET_NAME`, `YOUR_REGION`, `YOUR_ACCOUNT_ID`,
`YOUR_KEY.pem` and `EC2_PUBLIC_IP` with your values.

**Step 1: create the bucket** (once, from your PC)
```bash
aws s3api create-bucket --bucket YOUR_BUCKET_NAME --region YOUR_REGION --create-bucket-configuration LocationConstraint=YOUR_REGION
```
For `us-east-1`, leave out `--create-bucket-configuration`.

**Step 2: upload the dataset** (Windows PowerShell, from the `gear_fault_xai` folder)
The script reads `..\time domain` (Desktop\time domain) and uploads it to `raw/time domain/`.
```powershell
powershell -ExecutionPolicy Bypass -File deploy\upload_dataset.ps1 -Bucket YOUR_BUCKET_NAME -Region YOUR_REGION -DryRun
powershell -ExecutionPolicy Bypass -File deploy\upload_dataset.ps1 -Bucket YOUR_BUCKET_NAME -Region YOUR_REGION
```
The first run only lists what would be uploaded. Check with:
```bash
aws s3 ls s3://YOUR_BUCKET_NAME/raw/time\ domain/ --recursive --summarize
```

**Step 3: create the IAM policy and role** (once, from your PC)
Replace `YOUR_BUCKET_NAME` everywhere in `deploy/iam_policy.json`, then:
```bash
aws iam create-policy --policy-name gear-xai-s3 --policy-document file://deploy/iam_policy.json
aws iam create-role --role-name gear-xai-ec2 --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name gear-xai-ec2 --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/gear-xai-s3
aws iam create-instance-profile --instance-profile-name gear-xai-ec2
aws iam add-role-to-instance-profile --instance-profile-name gear-xai-ec2 --role-name gear-xai-ec2
```

**Step 4: launch the EC2 instance** (AWS console)
- AMI: **Ubuntu Server 22.04 LTS** (the setup script expects Python 3.10).
- Instance type: at least 8 GB RAM, for example `t3.large`. TensorFlow needs the memory.
- IAM instance profile: `gear-xai-ec2`.
- Key pair: create one and download the `.pem` file.
- Security group: allow SSH (22) and TCP **8000** from My IP only. The dashboard has no login, so
  don't open 8000 to `0.0.0.0/0`.

**Step 5: build the frontend and copy the project to the server** (Windows PowerShell)
Build the React UI first, so `frontend/dist` is in the copy:
```powershell
cd frontend; npm run build; cd ..
```
Then, from the folder that contains `gear_fault_xai`:
```powershell
tar --exclude=node_modules --exclude=__pycache__ --exclude=venv --exclude=archive_old_approach --exclude=gear_fault_xai -cf gear-xai.tar -C gear_fault_xai .
scp -i YOUR_KEY.pem gear-xai.tar ubuntu@EC2_PUBLIC_IP:/home/ubuntu/
```
Then connect and unpack it:
```bash
ssh -i YOUR_KEY.pem ubuntu@EC2_PUBLIC_IP
sudo mkdir -p /opt/gear-xai && sudo tar -xf /home/ubuntu/gear-xai.tar -C /opt/gear-xai
```

**Step 6: run the setup script** (on the server; takes several minutes because TensorFlow installs)
```bash
sudo bash /opt/gear-xai/deploy/setup_ec2.sh
```
This installs Python 3.10, the AWS CLI, the requirements and the systemd service. The service
starts on boot and restarts on failure.

**Step 7: set the bucket and region** (on the server)
```bash
sudo nano /etc/gear-xai.env
```
Set `S3_BUCKET=YOUR_BUCKET_NAME` and `AWS_REGION=YOUR_REGION`.

**Step 8: copy the dataset from S3 to the server** (on the server)
```bash
sudo -u ubuntu bash /opt/gear-xai/deploy/sync_dataset.sh
```
The last line should show 242 `.xlsx` files (123 in Position 1, 119 in Position 2).

**Step 9: start the dashboard**
```bash
sudo systemctl restart gear-xai
```

**Step 10: check it**
```bash
curl -s http://localhost:8000/health
curl -s "http://localhost:8000/datasets"
aws sts get-caller-identity
journalctl -u gear-xai -f
```
The health check should show `"status":"ok"` and `time_domain` in `datasets_loaded` once a prediction
has run. The identity ARN should contain `assumed-role/gear-xai-ec2`, which means the server uses the
role and not keys. Then open `http://EC2_PUBLIC_IP:8000` in a browser.

**Step 11 (optional): retrain**
```bash
bash /opt/gear-xai/deploy/retrain.sh
sudo systemctl restart gear-xai
```
`retrain.sh` syncs the dataset from S3, rebuilds the EMD caches, runs `src.train_meta_td` and
`src.shap_explain`, then publishes `models/` and `results/` back to S3. It **overwrites `models/time_domain/`
and `results/`** on the server. It is not scheduled. To schedule it, uncomment the cron line in its header
and add it with `crontab -e`.

**Troubleshooting**

| Message | Fix |
|---|---|
| `S3_BUCKET is not set` | Fill in `/etc/gear-xai.env`, then `sudo systemctl restart gear-xai` |
| `No AWS credentials found` | Attach the `gear-xai-ec2` instance profile to the instance (EC2 console > Actions > Security > Modify IAM role) |
| `AccessDenied` | The policy has the wrong bucket name, or it is not attached to `gear-xai-ec2` |
| `sync_dataset.sh` shows 0 `.xlsx` files | The dataset is not under `raw/time domain/`. Re-run Step 2 and check the prefix |
| `time_domain` shows an error on the dashboard | Run Step 8 (dataset missing on the server), then restart the service |
