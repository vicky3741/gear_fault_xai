"""
Enhancement: pair Position 1 + Position 2 of the same (rpm,load,cond,class) into a
2-channel sample (1024, 2), then run the winning temporal pipeline. More sensor
info usually lifts accuracy (like the old 3-channel setup).

Within-file temporal split (no leakage), EMD denoise -> FFT -> standardise,
3-seed ensemble, per-sample voting. All three models.
"""
import os, sys, json, glob, re
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config as C
from src import newdata_loader as NL
from src.newdata_compare import to_fft, augment, seed_all
from src.model import build_model as build_cnn
from src.model_cnn_bilstm import build_model as build_bilstm
from src.model_lsam_cnn_bilstm import build_model as build_lsam
import tensorflow as tf
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score, f1_score

WINDOW = 256
TRAIN_REGION, TEST_REGION = (0, 640), (640, 1024)
TRAIN_STRIDE, TEST_STRIDE = 64, 64
VAL_FRAC = 0.20
SEEDS = [42, 7, 123]
CACHE = os.path.join(C.PROC_DIR, "newdata_2ch_denoise.npz")
MODELS = {"1D-CNN": build_cnn, "CNN-BiLSTM": build_bilstm, "LSAM-CNN-BiLSTM": build_lsam}


def key_of(fname):
    """rpm_load_cond key, position-independent (strip _p1/_P2)."""
    base = re.sub(r"\.xlsx$", "", fname)
    base = re.sub(r"[_ ]?[pP][12]$", "", base)
    return base


def load_pairs():
    """Pair P1+P2 by (class,rpm_load_cond) -> X (N,1024,2), y, groups."""
    pos_dirs = sorted([d for d in os.listdir(NL.DATA_DIR)
                       if os.path.isdir(os.path.join(NL.DATA_DIR, d))])
    # build dict: (label,key) -> {pos_index: signal}
    store = {}
    for pi, pos in enumerate(pos_dirs):
        for folder, label in NL.FOLDER2LABEL.items():
            cdir = os.path.join(NL.DATA_DIR, pos, folder)
            if not os.path.isdir(cdir):
                continue
            for f in glob.glob(os.path.join(cdir, "*.xlsx")):
                bn = os.path.basename(f)
                if bn.startswith("~$"):
                    continue
                sig = pd.read_excel(f, header=None).iloc[:, 2].to_numpy(np.float32)
                sig = np.pad(sig, (0, max(0, NL.SIG_LEN - len(sig))))[:NL.SIG_LEN]
                store.setdefault((label, key_of(bn)), {})[pi] = sig
    X, y, g = [], [], []
    gid = 0
    for (label, k), d in store.items():
        if 0 in d and 1 in d:                      # both positions present
            X.append(np.stack([d[0], d[1]], axis=-1)); y.append(label); g.append(gid); gid += 1
    return np.asarray(X, np.float32), np.asarray(y), np.asarray(g)


def emd_denoise2(X):
    from PyEMD import EMD
    emd = EMD(); out = np.zeros_like(X)
    for i in range(len(X)):
        for c in range(X.shape[-1]):
            imfs = emd(X[i][:, c]); out[i, :, c] = imfs[1:].sum(0) if len(imfs) > 1 else imfs.sum(0)
        if (i+1) % 30 == 0: print(f"  EMD {i+1}/{len(X)}")
    return out.astype(np.float32)


def cut(Xd, y, g, region, stride):
    lo, hi = region; X, Y, G = [], [], []
    for i in range(len(Xd)):
        for s in range(lo, hi - WINDOW + 1, stride):
            X.append(Xd[i][s:s + WINDOW, :]); Y.append(y[i]); G.append(g[i])
    return np.asarray(X, np.float32), np.asarray(Y), np.asarray(G)


def main():
    X, y, g = load_pairs()
    print("paired samples", X.shape)
    import collections; print("classes", collections.Counter(y.tolist()))
    Xd = np.load(CACHE)["Xd"] if os.path.exists(CACHE) else emd_denoise2(X)
    if not os.path.exists(CACHE): np.savez_compressed(CACHE, Xd=Xd)

    Xtr0, ytr0, gtr = cut(Xd, y, g, TRAIN_REGION, TRAIN_STRIDE)
    Xte0, yte0, gte = cut(Xd, y, g, TEST_REGION, TEST_STRIDE)
    Xtr0, Xte0 = to_fft(Xtr0), to_fft(Xte0)
    mn = Xtr0.reshape(-1, 2).mean(0); sd = Xtr0.reshape(-1, 2).std(0) + 1e-8
    Xtr0 = (Xtr0 - mn) / sd; Xte0 = (Xte0 - mn) / sd
    le = LabelEncoder().fit(NL.CLASS_ORDER); ncl = len(NL.CLASS_ORDER); L = Xtr0.shape[1]
    ytr = le.transform(ytr0); yte = le.transform(yte0)
    print(f"train win {len(Xtr0)}  test win {len(Xte0)}  files {len(np.unique(gte))}")

    r = np.random.default_rng(0); idx = r.permutation(len(Xtr0)); nv = int(VAL_FRAC*len(idx))
    vi, ti = idx[:nv], idx[nv:]; Xv, yv = Xtr0[vi], ytr[vi]; Xt, yt = Xtr0[ti], ytr[ti]
    h = le.transform(["Healthy"])[0]

    results = {}
    for name, builder in MODELS.items():
        print(f"\n===== {name} =====")
        probs = []
        for s in SEEDS:
            seed_all(s); Xa, ya = augment(Xt, yt, s)
            p = np.random.default_rng(s).permutation(len(Xa)); Xa, ya = Xa[p], ya[p]
            m = builder(input_len=L, n_channels=2, n_classes=ncl)
            m.fit(Xa, tf.keras.utils.to_categorical(ya, ncl),
                  validation_data=(Xv, tf.keras.utils.to_categorical(yv, ncl)),
                  epochs=C.EPOCHS, batch_size=C.BATCH, verbose=0,
                  callbacks=[tf.keras.callbacks.EarlyStopping(patience=12, restore_best_weights=True),
                             tf.keras.callbacks.ReduceLROnPlateau(patience=6, factor=0.5)])
            probs.append(m.predict(Xte0, verbose=0))
            print(f"  seed {s} window-acc={accuracy_score(yte, probs[-1].argmax(1)):.3f}")
        ens = np.mean(probs, 0); yp = ens.argmax(1)
        win_acc = accuracy_score(yte, yp)
        recs = np.unique(gte); rt, rp = [], []
        for gg in recs:
            mk = gte == gg; rt.append(yte[mk][0]); rp.append(ens[mk].mean(0).argmax())
        rt, rp = np.array(rt), np.array(rp)
        rec_acc = accuracy_score(rt, rp); rec_f1 = f1_score(rt, rp, average="macro")
        rec_bin = accuracy_score((rt != h).astype(int), (rp != h).astype(int))
        results[name] = {"window_5class": round(float(win_acc), 4),
                         "file_5class": round(float(rec_acc), 4),
                         "file_macro_f1": round(float(rec_f1), 4),
                         "file_binary": round(float(rec_bin), 4)}
        print(f"  -> file 5-class={rec_acc:.4f}  binary={rec_bin:.4f}")

    json.dump(results, open(os.path.join(C.METRIC_DIR, "newdata_2ch.json"), "w"), indent=2)
    print("\n====== SUMMARY (2-channel p1+p2, temporal) ======")
    print(f"{'model':<18}{'win 5cls':>9}{'file 5cls':>10}{'file bin':>10}")
    for k, v in results.items():
        print(f"{k:<18}{v['window_5class']:>9}{v['file_5class']:>10}{v['file_binary']:>10}")


if __name__ == "__main__":
    main()
