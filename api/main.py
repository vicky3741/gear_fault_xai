"""
FastAPI backend for the Gear/Bearing Fault Diagnosis + XAI dashboard.
Reads models via src.inference and metrics/SHAP from results/. Never invents numbers.
Run:  uvicorn api.main:app --reload --port 8000   (or: python run_dashboard.py)
"""
import os, sys, json, glob, tempfile
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import numpy as np
import pandas as pd
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

import config as C
from src import inference as INF
from api import io_utils, explain as EX, db, report as REP, alerts

app = FastAPI(title="Fault Diagnosis + XAI API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

CLASS_COLORS = {"Healthy": "#2e7d32", "Severity-25": "#f9a825", "Severity-50": "#f57f17",
                "Severity-75": "#ef6c00", "Severity-100": "#c62828"}

# The only dataset: time_domain (3-model META ensemble).
PRIMARY = ["time_domain"]


@app.on_event("startup")
def _startup():
    for ds in PRIMARY:                      # current project only
        try:
            INF.load_bundle(ds)
            print(f"[startup] loaded {ds}")
        except Exception as e:
            print(f"[startup] could not load {ds}: {e}")


@app.get("/health")
def health():
    return {"status": "ok", "datasets_loaded": list(INF._CACHE.keys())}


@app.get("/datasets")
def datasets():
    out = []
    for key, info in INF.DATASETS.items():
        if key not in PRIMARY:
            continue
        try:
            b = INF.load_bundle(key)
            pp = b["pp"]
            prep = {"fs": pp.get("fs"), "window": pp.get("window"),
                    "stride": pp.get("test_stride", pp.get("stride")), "n_bins": pp.get("n_bins"),
                    "emd_denoise": pp.get("emd_denoise"), "emd_drop_imf": pp.get("drop_imf"),
                    "use_fft": pp.get("use_fft")}
            out.append({"key": key, "label": info["label"], "n_channels": info["n_channels"],
                        "classes": list(b["le"].classes_), "models": b["model_files"],
                        "class_colors": CLASS_COLORS,
                        "preprocessing": {k: (v.item() if hasattr(v, "item") else v)
                                          for k, v in prep.items()}})
        except Exception as e:
            out.append({"key": key, "label": info["label"], "error": str(e)})
    return {"datasets": out}


@app.get("/samples")
def samples(dataset: str):
    _check(dataset)
    return {"dataset": dataset, "samples": io_utils.list_samples(dataset)}


def _check(dataset):
    if dataset not in INF.DATASETS:
        raise HTTPException(400, f"unknown dataset '{dataset}'")


def _raw_from_sample(dataset, sample_id, file):
    """Only recordings from the cloud dataset are accepted. Uploaded files are refused."""
    if file is not None:
        raise HTTPException(400, "file upload is disabled; choose a cloud sample")
    if not sample_id:
        raise HTTPException(400, "choose a cloud sample")
    return io_utils.load_sample_raw(dataset, sample_id), f"sample:{sample_id}"


def _per_model_votes(dataset, raw):
    """Each ensemble member's own recording-level vote (read-only: same preprocessing and models
    as src.inference; the META result is the mean of these). Keyed by model file stem."""
    b = INF.load_bundle(dataset)
    classes = list(b["le"].classes_)
    X, _ = INF.preprocess_recording(raw, b["pp"])
    out = {}
    for f, m in zip(b["model_files"], b["models"]):
        p = m.predict(X, verbose=0).mean(0)
        k = int(p.argmax())
        out[os.path.splitext(f)[0]] = {"probabilities": {classes[i]: float(p[i]) for i in range(len(classes))},
                                       "predicted_class": classes[k], "confidence": float(p[k])}
    return out


@app.get("/signal")
def signal(dataset: str, sample_id: str):
    """Raw vibration signal of one recording (both sensors) and its amplitude spectrum.
    The spectrum is rfft/N of the whole raw recording, for viewing only (the model uses
    EMD-denoised, windowed FFTs)."""
    _check(dataset)
    try:
        raw = io_utils.load_sample_raw(dataset, sample_id)
    except Exception as e:
        raise HTTPException(404, f"recording not found: {sample_id} ({e})")
    pp = INF.load_bundle(dataset)["pp"]
    fs = float(pp.get("fs"))
    n = int(raw.shape[0])
    spec = np.abs(np.fft.rfft(raw, axis=0)) / n
    return {"dataset": dataset, "sample_id": sample_id, "fs": fs, "n_samples": n,
            "duration_s": n / fs, "channels": ["p1", "p2"][: raw.shape[1]],
            "t": (np.arange(n) / fs).round(6).tolist(),
            "signal": {f"p{c + 1}": raw[:, c].astype(float).tolist() for c in range(raw.shape[1])},
            "fft": {"freqs": np.fft.rfftfreq(n, 1.0 / fs).tolist(),
                    **{f"p{c + 1}": spec[:, c].astype(float).tolist() for c in range(raw.shape[1])}},
            "window": int(pp.get("window")), "stride": int(pp.get("test_stride", pp.get("stride")))}


@app.post("/predict")
async def predict(dataset: str = Form(...), sample_id: str = Form(None),
                  file: UploadFile = File(None)):
    _check(dataset)
    raw, src = _raw_from_sample(dataset, sample_id, file)
    res = INF.predict_recording(dataset, raw)
    res["per_model"] = _per_model_votes(dataset, raw)
    res["warning"] = None
    res["class_colors"] = CLASS_COLORS
    prev = db.last_class(dataset)                     # machine's previous diagnosis, before this one
    res["id"] = db.add(dataset, src, res)
    res["alert"] = alerts.check_and_alert(dataset, prev, res)
    return res


@app.post("/explain")
async def explain(dataset: str = Form(...), sample_id: str = Form(None),
                  target_class: str = Form(None), model: str = Form(None),
                  file: UploadFile = File(None)):
    _check(dataset)
    raw, src = _raw_from_sample(dataset, sample_id, file)
    try:
        out = EX.explain_recording(dataset, raw, target_class=target_class, model=model)
    except ValueError as e:
        raise HTTPException(400, str(e))
    out["sentence"] = EX.explanation_sentence(out["top10_bands"], out["predicted_class"])
    out["warning"] = None
    return out


@app.get("/global-explanations")
def global_explanations(dataset: str):
    _check(dataset)
    d = os.path.join(C.XAI_DIR, "..", "shap", dataset)
    d = os.path.join(C.RESULTS_DIR, "shap", dataset)
    if not os.path.isdir(d):
        return JSONResponse({"available": False, "message": "not available"}, status_code=200)
    out = {"available": True, "dataset": dataset}
    tb = os.path.join(d, "top_bands_per_class.json")
    if os.path.exists(tb):
        out["top_bands_per_class"] = json.load(open(tb))
    for name, fn in [("channel_importance", "channel_importance.csv"),
                     ("global_shap_bands", "global_shap_bands.csv"),
                     ("feature_importance", "feature_importance.csv")]:
        p = os.path.join(d, fn)
        if os.path.exists(p):
            out[name] = pd.read_csv(p).to_dict(orient="records")
    ag = os.path.join(d, "agreement.json")
    if os.path.exists(ag):
        out["agreement"] = json.load(open(ag))
    return out


@app.get("/metrics")
def metrics(dataset: str):
    """Current-project metrics only (deployed 3-model META on time_domain)."""
    _check(dataset)
    out = {"dataset": dataset}
    # deployed META (saved 3-model ensemble)
    dm = os.path.join(C.METRIC_DIR, "time_domain_meta.json")
    if os.path.exists(dm):
        out["deployed_meta"] = json.load(open(dm))
    # full per-model comparison (5-seed experiment, for reference)
    nm = os.path.join(C.METRIC_DIR, "newdata_meta.json")
    if os.path.exists(nm):
        out["model_comparison"] = json.load(open(nm))
    # earlier experiments (A8), described from the docstrings of the scripts that wrote them
    exps = []
    for key, label, protocol in EXPERIMENTS:
        p = os.path.join(C.METRIC_DIR, f"{key}.json")
        if os.path.exists(p):
            exps.append({"key": key, "label": label, "protocol": protocol, "results": json.load(open(p))})
    out["experiments"] = exps
    # reference confusion matrix (A7): NOT the deployed model, see REFERENCE_CONFUSION_NOTE
    rc = os.path.join(C.METRIC_DIR, "time_domain_test.json")
    if os.path.exists(rc):
        out["reference_confusion"] = {**json.load(open(rc)), "note": REFERENCE_CONFUSION_NOTE}
    return out


# (file stem, short label, protocol) - text taken from each script's docstring in src/
EXPERIMENTS = [
    ("newdata_compare", "1 sensor · unseen recordings",
     "Single channel; file-level split (test recordings never seen in training); window 256, stride 128; "
     "EMD denoise, FFT, standardise; 3-seed ensemble per model (src/newdata_compare.py)."),
    ("newdata_temporal", "1 sensor · time split",
     "Single channel; within-file temporal split (train samples 0-640, test 640-1024); stride 64; "
     "EMD denoise, FFT, standardise; 3-seed ensemble per model (src/newdata_compare_temporal.py)."),
    ("newdata_2ch", "2 sensors · time split",
     "Positions p1 + p2 paired as 2 channels; within-file temporal split; EMD denoise, FFT, standardise; "
     "3-seed ensemble per model (src/newdata_2ch.py)."),
    ("newdata_push", "2 sensors · stride 32 + augmentation",
     "p1 + p2; within-file temporal split; window 256, stride 32; train-only augmentation; "
     "5-seed ensemble per model (src/newdata_push.py)."),
]
REFERENCE_CONFUSION_NOTE = ("Reference only: 1D-CNN, 2-channel, 3 seeds (42, 7, 123). Its scores equal the 1D-CNN row of "
                            "newdata_2ch. Not the deployed META ensemble; the script that wrote it is not in the repository.")


@app.get("/class-spectra")
def class_spectra(dataset: str):
    """Average amplitude spectrum (rfft/N of the raw recording) per true class and sensor (A5).
    Computed once from the dataset files, then cached in data/processed/."""
    _check(dataset)
    samples = io_utils.list_samples(dataset)
    import hashlib
    sig = f"{len(samples)}:" + hashlib.md5("|".join(s["id"] for s in samples).encode()).hexdigest()[:12]
    cache = os.path.join(C.PROC_DIR, f"class_spectra_{dataset}.json")
    if os.path.exists(cache):
        try:
            c = json.load(open(cache))
            if c.get("signature") == sig:
                return c
        except Exception:
            pass
    fs = float(INF.load_bundle(dataset)["pp"]["fs"])
    acc = {}
    for s in samples:
        raw = io_utils.load_sample_raw(dataset, s["id"])
        spec = np.abs(np.fft.rfft(raw, axis=0)) / raw.shape[0]          # (bins, ch)
        a = acc.setdefault(s["class"], {"sum": np.zeros_like(spec), "n": 0})
        a["sum"] += spec; a["n"] += 1
    n_samples = raw.shape[0] if samples else 0
    out = {"dataset": dataset, "signature": sig, "fs": fs, "n_samples": int(n_samples),
           "freqs": np.fft.rfftfreq(n_samples, 1.0 / fs).tolist() if samples else [],
           "classes": {cls: {"n": a["n"],
                             **{f"p{c + 1}": (a["sum"][:, c] / a["n"]).tolist() for c in range(a["sum"].shape[1])}}
                       for cls, a in acc.items()}}
    json.dump(out, open(cache, "w"))
    return out


@app.get("/batch-samples")
def batch_samples(dataset: str, ids: str = None):
    """Run the model on every cloud recording, or only on `ids` (comma-separated sample ids).
    Results are not saved to history and send no alerts."""
    _check(dataset)
    rows = []
    todo = io_utils.list_samples(dataset)
    if ids:
        wanted = [i for i in ids.split(",") if i]
        known = {s["id"]: s for s in todo}
        unknown = [i for i in wanted if i not in known]
        if unknown:
            raise HTTPException(400, f"unknown recording(s): {', '.join(unknown[:5])}")
        todo = [known[i] for i in wanted]
    for s in todo:
        try:
            r = INF.predict_recording(dataset, io_utils.load_sample_raw(dataset, s["id"]))
            rows.append({"file": s["id"], "class": s["class"], "predicted_class": r["predicted_class"],
                         "confidence": round(r["confidence"], 3), "binary_verdict": r["binary_verdict"],
                         "match": r["predicted_class"] == s["class"]})
        except Exception as e:
            rows.append({"file": s["id"], "class": s["class"], "error": str(e)})
    matches = sum(1 for r in rows if r.get("match"))
    return {"dataset": dataset, "results": rows, "matches": matches, "total": len(rows)}


@app.get("/history")
def history(dataset: str = None, limit: int = 100):
    return {"history": db.list_all(limit=limit, dataset=dataset)}


@app.get("/history/{rid}")
def history_item(rid: int):
    """The full saved result of one past diagnosis (A4)."""
    res = db.get(rid)
    if not res:
        raise HTTPException(404, "prediction not found")
    row = next((r for r in db.list_all(limit=100000) if r["id"] == rid), None)
    return {"id": rid, "ts": row["ts"] if row else None, "source": row["source"] if row else None, "result": res}


@app.delete("/history/{rid}")
def history_delete(rid: int):
    db.delete(rid); return {"deleted": rid}


@app.get("/report/{rid}")
def report(rid: int):
    res = db.get(rid)
    if not res:
        raise HTTPException(404, "prediction not found")
    out = os.path.join(tempfile.gettempdir(), f"report_{rid}.pdf")
    REP.build_pdf(res, out)
    return FileResponse(out, media_type="application/pdf", filename=f"diagnosis_{rid}.pdf")


# ---- serve built frontend (production) at / ----
_DIST = os.path.join(C.PROJECT_DIR, "frontend", "dist")
if os.path.isdir(_DIST):
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="frontend")
