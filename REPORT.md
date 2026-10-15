# Gear Fault Severity Diagnosis with Explainable AI — Report

## 1. Problem

One rotating gear machine is monitored with two vibration sensors (position 1 and position 2).
The system classifies its condition into five levels — Healthy, 25%, 50%, 75%, 100% fault —
explains each decision with SHAP (which frequency bands mattered), and alerts the admin by SMS
when the fault severity rises to 50%, 75% or 100%.

## 2. Data

- Folder `Position 1` and `Position 2`, each with Healthy, 25%, 50%, 75% and 100% folders.
- Each file: 1024 samples in column C, sampling rate about 2560 Hz.
- Each recording has a file from both positions, which are paired into one 2-channel sample.
- 117 paired recordings (`results/metrics/time_domain_meta.json`).
- Stored in AWS S3 (`raw/time domain/`) and copied to the server for the dashboard.

## 3. Method

```
two sensor files (p1 + p2)
  -> normalise per channel
  -> EMD denoise (drop the first IMF)
  -> windows (256 samples, stride 32; train and test regions do not overlap)
  -> FFT magnitude
  -> standardise (training statistics only)
  -> 3 models: 1D-CNN, CNN-BiLSTM, LSAM-CNN-BiLSTM
  -> average the softmax outputs (META ensemble) and vote over the windows of a recording
  -> predicted class, confidence, SHAP frequency bands
```

## 4. Results

From the saved result files in `results/metrics/`:

| Model | 5-class accuracy | Healthy vs fault |
|---|---|---|
| 1D-CNN | 0.889 | 0.983 |
| CNN-BiLSTM | 0.880 | 0.974 |
| LSAM-CNN-BiLSTM | 0.863 | 0.983 |
| META ensemble, 3 models × 5 seeds (15 models) | **0.906** | **0.992** |
| META ensemble, 3 models × 1 seed (deployed) | 0.863 | 0.966 |

The deployed ensemble is the one-seed version. The 15-model ensemble is the best result but is not yet
deployed.

## 5. Explainability

SHAP shows which frequency bands the model relied on for each prediction. It shows what the model used.
It is not proof of a physical defect location. Maintenance text is guidance, not a rule.

## 6. Deployment

- The FastAPI backend and the React dashboard run on an AWS EC2 server (`gear-xai-server`, Mumbai).
- The server copies the dataset and models from the S3 bucket at setup time. The app itself does not read S3.
- Only cloud recordings can be diagnosed. Uploaded files are refused.
- Admin SMS alerts (AWS SNS): sent when the machine moves up to 50%, 75% or 100% compared with its previous
  diagnosis. Each level has its own message with the health, the reason, the main frequency band and the action.

## 7. Limitations

- The dataset is small (117 recordings), so neighbouring severities (for example 50% and 75%) are sometimes confused.
- The SHAP explanation depends on the model, not on known gear geometry.
- SMS delivery to Indian numbers needs DLT registration of the sender ID and the message template.

## 8. Files

- `config.py`: paths and settings
- `src/newdata_loader.py`, `src/newdata_2ch.py`: dataset loading and pairing
- `src/train_meta_td.py`: trains the 3 models and saves them to `models/time_domain/`
- `src/shap_explain.py`: SHAP explanations
- `src/inference.py`: preprocessing and prediction
- `api/main.py`: API endpoints; `api/alerts.py`: SMS alert rules
- `frontend/src/App.tsx`: dashboard
- `deploy/`: AWS setup, dataset sync, retrain and service files
