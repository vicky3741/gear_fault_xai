"""pytest for /predict and /explain using one real time-domain recording per class."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)
DATASET = "time_domain"
CLASSES = ["Healthy", "Severity-25", "Severity-50", "Severity-75", "Severity-100"]


def _one_sample_per_class():
    """First recording id of each class, from the dataset's own sample list."""
    samples = client.get("/samples", params={"dataset": DATASET}).json()["samples"]
    picked = {}
    for s in samples:
        picked.setdefault(s["class"], s["id"])
    return picked


def test_health():
    assert client.get("/health").json()["status"] == "ok"


def test_datasets():
    d = client.get("/datasets").json()["datasets"]
    assert any(x["key"] == DATASET and "error" not in x for x in d)


def test_predict_all_classes():
    picked = _one_sample_per_class()
    assert set(picked) == set(CLASSES)
    correct = 0
    for true in CLASSES:
        r = client.post("/predict", data={"dataset": DATASET, "sample_id": picked[true]})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["predicted_class"] in j["classes"]
        assert 0.0 <= j["confidence"] <= 1.0
        if j["predicted_class"] == true:
            correct += 1
    assert correct >= 3            # at least a majority correct (honest threshold)


def test_per_model_votes_average_to_the_ensemble():
    sid = _one_sample_per_class()["Severity-50"]
    j = client.post("/predict", data={"dataset": DATASET, "sample_id": sid}).json()
    pm = j["per_model"]
    assert set(pm) == {"cnn", "cnnbilstm", "lsam"}
    for cls, p in j["mean_probabilities"].items():
        mean_of_models = sum(m["probabilities"][cls] for m in pm.values()) / len(pm)
        assert abs(mean_of_models - p) < 1e-4
    for m in pm.values():
        assert m["predicted_class"] in j["classes"] and 0.0 <= m["confidence"] <= 1.0


def test_signal():
    sid = _one_sample_per_class()["Healthy"]
    j = client.get("/signal", params={"dataset": DATASET, "sample_id": sid}).json()
    n = j["n_samples"]
    assert j["fs"] > 0 and len(j["t"]) == n
    assert set(j["signal"]) == {"p1", "p2"} and all(len(v) == n for v in j["signal"].values())
    assert len(j["fft"]["freqs"]) == n // 2 + 1 == len(j["fft"]["p1"])
    assert client.get("/signal", params={"dataset": DATASET, "sample_id": "Healthy|nope"}).status_code == 404


def test_metrics_experiments_and_reference_confusion():
    j = client.get("/metrics", params={"dataset": DATASET}).json()
    assert "deployed_meta" in j
    assert {e["key"] for e in j["experiments"]} >= {"newdata_compare", "newdata_2ch"}
    rc = j["reference_confusion"]
    assert len(rc["confusion"]) == len(rc["classes"]) and "not the deployed" in rc["note"].lower()


def test_class_spectra_and_cache():
    j = client.get("/class-spectra", params={"dataset": DATASET}).json()
    assert set(j["classes"]) == set(CLASSES)
    assert sum(c["n"] for c in j["classes"].values()) == len(client.get("/samples", params={"dataset": DATASET}).json()["samples"])
    assert all(len(c["p1"]) == len(j["freqs"]) for c in j["classes"].values())
    assert client.get("/class-spectra", params={"dataset": DATASET}).json()["signature"] == j["signature"]


def test_batch_selected_ids():
    picked = _one_sample_per_class()
    ids = [picked["Healthy"], picked["Severity-75"]]
    j = client.get("/batch-samples", params={"dataset": DATASET, "ids": ",".join(ids)}).json()
    assert [r["file"] for r in j["results"]] == ids and j["total"] == 2
    assert client.get("/batch-samples", params={"dataset": DATASET, "ids": "Healthy|nope"}).status_code == 400


def test_history_item_roundtrip():
    sid = _one_sample_per_class()["Severity-25"]
    p = client.post("/predict", data={"dataset": DATASET, "sample_id": sid}).json()
    j = client.get(f"/history/{p['id']}").json()
    assert j["id"] == p["id"] and j["source"] == f"sample:{sid}"
    assert j["result"]["predicted_class"] == p["predicted_class"] and "per_model" in j["result"]
    assert client.get("/history/999999").status_code == 404


def test_file_upload_is_refused():
    r = client.post("/predict", data={"dataset": DATASET},
                    files={"file": ("x.xlsx", b"not used", "application/octet-stream")})
    assert r.status_code == 400
    assert "cloud sample" in r.json()["detail"]


def test_explain():
    sid = _one_sample_per_class()["Severity-100"]
    r = client.post("/explain", data={"dataset": DATASET, "sample_id": sid})
    assert r.status_code == 200, r.text
    j = r.json()
    assert "top10_bands" in j and len(j["top10_bands"]) > 0
    assert "channel_importance" in j
    assert "sentence" in j
    assert j["explained_model"] == "cnn"            # default unchanged: the first model (1D-CNN)


def test_explain_each_model():
    sid = _one_sample_per_class()["Severity-75"]
    for m in ("cnnbilstm", "lsam"):
        r = client.post("/explain", data={"dataset": DATASET, "sample_id": sid, "model": m})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["explained_model"] == m and len(j["shap_per_bin"]) == len(j["frequencies"])
    r = client.post("/explain", data={"dataset": DATASET, "sample_id": sid, "model": "nope"})
    assert r.status_code == 400
