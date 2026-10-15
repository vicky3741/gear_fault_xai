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
