"""
Shared helpers for the API: list the cloud (time-domain) recordings and load one of them.
"""
import os, glob, re
import numpy as np
import pandas as pd

from src import newdata_loader as NL


def list_samples(dataset, limit=400):
    """List recordings for the 'pick a sample' dropdown: each recording needs both positions."""
    out = []
    store = {}
    for pos in sorted(os.listdir(NL.DATA_DIR)):
        pdir = os.path.join(NL.DATA_DIR, pos)
        if not os.path.isdir(pdir):
            continue
        for folder, label in NL.FOLDER2LABEL.items():
            cdir = os.path.join(pdir, folder)
            if not os.path.isdir(cdir):
                continue
            for f in glob.glob(os.path.join(cdir, "*.xlsx")):
                bn = os.path.basename(f)
                if bn.startswith("~$"):
                    continue
                key = re.sub(r"[_ ]?[pP][12]\.xlsx$", "", bn)
                store.setdefault((label, key), set()).add(pos)
    for (label, key), poss in sorted(store.items()):
        if len(poss) >= 2:
            parts = key.split("_")
            out.append({"id": f"{label}|{key}", "dataset": dataset, "class": label,
                        "rpm": int(parts[0]) if parts and parts[0].isdigit() else None,
                        "load": int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else None,
                        "files": [f"{key}_p1.xlsx", f"{key}_p2.xlsx"]})
    return out[:limit]


def load_sample_raw(dataset, sample_id):
    """Load a sample recording (by id from list_samples) into a (T, ch) raw array."""
    label, key = sample_id.split("|")
    folder = [k for k, v in NL.FOLDER2LABEL.items() if v == label][0]
    sigs = []
    for pos in sorted(os.listdir(NL.DATA_DIR)):
        cdir = os.path.join(NL.DATA_DIR, pos, folder)
        if not os.path.isdir(cdir):
            continue
        cand = glob.glob(os.path.join(cdir, key + "_[pP][12].xlsx"))
        if cand:
            s = pd.read_excel(cand[0], header=None).iloc[:, 2].to_numpy(np.float32)
            sigs.append(np.pad(s, (0, max(0, NL.SIG_LEN - len(s))))[:NL.SIG_LEN])
    return np.stack(sigs[:2], axis=-1)
