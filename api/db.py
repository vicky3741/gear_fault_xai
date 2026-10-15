"""SQLite history of predictions."""
import os, sqlite3, json, time
import config as C

DB_PATH = os.path.join(C.PROJECT_DIR, "data", "history.db")


def _conn():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    c = sqlite3.connect(DB_PATH)
    c.execute("""CREATE TABLE IF NOT EXISTS history(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts REAL, dataset TEXT, source TEXT, predicted_class TEXT,
        confidence REAL, binary_verdict TEXT, payload TEXT)""")
    return c


def add(dataset, source, result):
    c = _conn()
    c.execute("INSERT INTO history(ts,dataset,source,predicted_class,confidence,binary_verdict,payload)"
              " VALUES(?,?,?,?,?,?,?)",
              (time.time(), dataset, source, result["predicted_class"],
               result["confidence"], result["binary_verdict"], json.dumps(result)))
    c.commit(); rid = c.execute("SELECT last_insert_rowid()").fetchone()[0]
    c.close(); return rid


def last_class(dataset):
    """Predicted class of the most recent saved diagnosis for this dataset, or None."""
    c = _conn()
    r = c.execute("SELECT predicted_class FROM history WHERE dataset=? ORDER BY id DESC LIMIT 1",
                  (dataset,)).fetchone()
    c.close()
    return r[0] if r else None


def list_all(limit=200, dataset=None):
    c = _conn()
    q = "SELECT id,ts,dataset,source,predicted_class,confidence,binary_verdict FROM history"
    args = []
    if dataset:
        q += " WHERE dataset=?"; args.append(dataset)
    q += " ORDER BY id DESC LIMIT ?"; args.append(limit)
    rows = c.execute(q, args).fetchall(); c.close()
    cols = ["id", "ts", "dataset", "source", "predicted_class", "confidence", "binary_verdict"]
    return [dict(zip(cols, r)) for r in rows]


def get(rid):
    c = _conn()
    r = c.execute("SELECT payload FROM history WHERE id=?", (rid,)).fetchone()
    c.close()
    return json.loads(r[0]) if r else None


def delete(rid):
    c = _conn(); c.execute("DELETE FROM history WHERE id=?", (rid,)); c.commit(); c.close()
