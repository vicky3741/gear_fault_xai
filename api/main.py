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
            out.append({"key": key, "label": info["label"], "n_channels": info["n_channels"],
                        "classes": list(b["le"].classes_), "models": b["model_files"],
                        "class_colors": CLASS_COLORS})
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


def _top_band(dataset, raw, res, prev):
    """Main frequency band for the alert text. Computed only when an alert may be sent."""
    if not alerts.should_alert(prev, res["predicted_class"]):
        return None
    try:
        return EX.explain_recording(dataset, raw)["top10_bands"][0]["band"]
    except Exception:
        return None


@app.post("/predict")
async def predict(dataset: str = Form(...), sample_id: str = Form(None),
                  file: UploadFile = File(None)):
    _check(dataset)
    raw, src = _raw_from_sample(dataset, sample_id, file)
    res = INF.predict_recording(dataset, raw)
    res["warning"] = None
    res["class_colors"] = CLASS_COLORS
    prev = db.last_class(dataset)                     # machine's previous diagnosis, before this one
    top = _top_band(dataset, raw, res, prev)
    res["id"] = db.add(dataset, src, res)
    res["alert"] = alerts.check_and_alert(dataset, prev, res, top)
    return res


@app.post("/explain")
async def explain(dataset: str = Form(...), sample_id: str = Form(None),
                  target_class: str = Form(None), file: UploadFile = File(None)):
    _check(dataset)
    raw, src = _raw_from_sample(dataset, sample_id, file)
    out = EX.explain_recording(dataset, raw, target_class=target_class)
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
    return out


@app.get("/batch-samples")
def batch_samples(dataset: str):
    """Run the model on every cloud recording. Results are not saved to history and send no alerts."""
    _check(dataset)
    rows = []
    for s in io_utils.list_samples(dataset):
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
