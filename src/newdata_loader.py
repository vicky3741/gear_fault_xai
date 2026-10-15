"""
Loader for the 'time domain' dataset (folder set by TIME_DOMAIN_DIR in config.py).

Layout:  <Position N>/<class>/<rpm>_<load>_<cond>_p{1,2}.xlsx
Each xlsx: 1024 rows, 3 cols -> col A index, col B time, col C signal (USE col C).
Fs ~ 2560 Hz (dt = 0.000391 s).

One file = one recording = one GROUP (for leakage-safe file-level splitting).
Single channel (column C).
"""
import os, glob
import numpy as np
import pandas as pd

import config as C

DATA_DIR = C.TIME_DOMAIN_DIR
FS = 2560
SIG_LEN = 1024
FOLDER2LABEL = {"Healthy": "Healthy", "25%": "Severity-25", "50%": "Severity-50",
                "75%": "Severity-75", "100%": "Severity-100"}
CLASS_ORDER = ["Healthy", "Severity-25", "Severity-50", "Severity-75", "Severity-100"]


def load_files():
    """Return X (N, SIG_LEN, 1) col-C signals, y labels, groups (file index), meta."""
    X, y, groups, meta = [], [], [], []
    gid = 0
    for pos in sorted(os.listdir(DATA_DIR)):
        pdir = os.path.join(DATA_DIR, pos)
        if not os.path.isdir(pdir):
            continue
        for folder, label in FOLDER2LABEL.items():
            cdir = os.path.join(pdir, folder)
            if not os.path.isdir(cdir):
                continue
            for f in glob.glob(os.path.join(cdir, "*.xlsx")):
                if os.path.basename(f).startswith("~$"):
                    continue
                try:
                    sig = pd.read_excel(f, header=None).iloc[:, 2].to_numpy(np.float32)
                except Exception as e:
                    print("skip", f, e); continue
                if len(sig) < SIG_LEN:
                    sig = np.pad(sig, (0, SIG_LEN - len(sig)))
                sig = sig[:SIG_LEN]
                X.append(sig[:, None])              # (SIG_LEN,1)
                y.append(label); groups.append(gid)
                meta.append(os.path.basename(f)); gid += 1
    return (np.asarray(X, np.float32), np.asarray(y),
            np.asarray(groups), np.asarray(meta))


if __name__ == "__main__":
    X, y, g, m = load_files()
    print("files:", X.shape, "groups:", len(np.unique(g)))
    import collections
    print("class counts:", collections.Counter(y.tolist()))
    print("sample names:", m[:3].tolist())
