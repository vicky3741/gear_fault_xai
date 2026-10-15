"""
Shared inference for the time-domain dataset, used by the FastAPI API.

Loads a dataset's model(s) + preproc.pkl + label encoder, and applies the SAME
preprocessing used in training (EMD denoise -> window -> FFT(rfft,/N) -> standardise),
then predicts per window and aggregates with per-recording voting.

Registry:
  time_domain -> models/time_domain/ (2-channel p1/p2, 3-model META ensemble)
"""
import os, sys, glob, pickle
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config as C

MODELS_ROOT = C.MODEL_DIR
DATASETS = {
    "time_domain": {"dir": os.path.join(MODELS_ROOT, "time_domain"), "n_channels": 2,
                    "label": "Time-domain dataset (p1+p2, 2560 Hz)"},
}

_CACHE = {}


def _emd_denoise(sig, drop):
    """sig (T,) -> reconstruct dropping first `drop` IMFs."""
    from PyEMD import EMD
    imfs = EMD()(sig)
    return imfs[drop:].sum(0) if len(imfs) > drop else imfs.sum(0)


def load_bundle(dataset):
    """Load + cache {models, le, pp} for a dataset key."""
    if dataset in _CACHE:
        return _CACHE[dataset]
    import tensorflow as tf
    tf.keras.config.enable_unsafe_deserialization()   # our own LSAM uses a Lambda layer
    info = DATASETS[dataset]; d = info["dir"]
    pp = pickle.load(open(os.path.join(d, "preproc.pkl"), "rb"))
    le = pickle.load(open(os.path.join(d, "label_encoder.pkl"), "rb"))
    keras_files = sorted(glob.glob(os.path.join(d, "*.keras")))
    models = [tf.keras.models.load_model(f, compile=False, safe_mode=False)
              for f in keras_files]
    bundle = {"models": models, "le": le, "pp": pp, "info": info,
              "model_files": [os.path.basename(f) for f in keras_files]}
    _CACHE[dataset] = bundle
    return bundle


def _windows(sig_len, window, stride):
    return list(range(0, sig_len - window + 1, stride))


def preprocess_recording(raw, pp):
    """
    raw: (T, ch) float array (already the right #channels for the dataset).
    Returns X (n_windows, bins, ch) ready for the model, plus window starts.
    Applies EMD denoise -> window(test_stride) -> FFT(rfft,/N) -> standardise.
    """
    raw = np.asarray(raw, np.float32)
    window = pp["window"]
    stride = pp.get("test_stride", pp.get("stride", window))
    drop = pp.get("drop_imf", 1)
    ch = raw.shape[1]

    # EMD denoise per channel on the full recording
    if pp.get("emd_denoise", True):
        den = np.zeros_like(raw)
        for c in range(ch):
            den[:, c] = _emd_denoise(raw[:, c], drop)
        raw = den

    starts = _windows(len(raw), window, stride)
    if not starts:
        # pad up to one window
        raw = np.pad(raw, ((0, window - len(raw)), (0, 0)))
        starts = [0]
    wins = np.stack([raw[s:s + window, :] for s in starts])          # (n,window,ch)

    if pp.get("use_fft", True):
        wins = np.abs(np.fft.rfft(wins, axis=1)) / wins.shape[1]      # (n,bins,ch)

    mean = np.asarray(pp["mean"]); std = np.asarray(pp["std"])
    wins = (wins - mean) / std
    return wins.astype(np.float32), starts


def predict_recording(dataset, raw):
    """
    Full prediction for a recording. Returns a dict with per-window probs,
    mean probs (ensemble), majority vote, binary verdict, confidence.
    """
    b = load_bundle(dataset)
    pp, le, models = b["pp"], b["le"], b["models"]
    classes = list(le.classes_)
    X, starts = preprocess_recording(raw, pp)

    # average over ensemble members
    probs = np.mean([m.predict(X, verbose=0) for m in models], axis=0)  # (n_win, ncl)
    win_pred = probs.argmax(1)
    mean_prob = probs.mean(0)                                           # per-recording vote
    pred = int(mean_prob.argmax())
    conf = float(mean_prob[pred])
    healthy_idx = classes.index("Healthy") if "Healthy" in classes else 0
    verdict = "Healthy" if pred == healthy_idx else "Faulty"

    return {
        "dataset": dataset,
        "classes": classes,
        "n_windows": int(len(starts)),
        "window_starts": [int(s) for s in starts],
        "window_predictions": [classes[i] for i in win_pred],
        "window_probabilities": probs.tolist(),
        "mean_probabilities": {classes[i]: float(mean_prob[i]) for i in range(len(classes))},
        "predicted_class": classes[pred],
        "predicted_index": pred,
        "confidence": conf,
        "low_confidence": conf < 0.60,
        "binary_verdict": verdict,
        "X_model_input_shape": list(X.shape),
    }


if __name__ == "__main__":
    # smoke test on dataset2 using one paired recording
    from src.newdata_2ch import load_pairs
    X, y, g = load_pairs()
    print("sample true:", y[0])
    out = predict_recording("time_domain", X[0])
    print("pred:", out["predicted_class"], "conf:", round(out["confidence"], 3),
          "verdict:", out["binary_verdict"], "windows:", out["n_windows"])
