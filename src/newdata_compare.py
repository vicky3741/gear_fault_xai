"""
Run ALL THREE models on the 'time domain' dataset and report accuracy each.

Pipeline (our winning one, single channel):
  col-C signal -> EMD denoise(drop IMF1) -> segment(256, stride128) -> FFT(rfft,/N)
  -> standardise(train stats) -> model -> prediction -> per-file voting
Leakage-safe: FILE-LEVEL group split (train files vs test files share no windows).
3-seed ensemble per model. Prints window + per-file (recording) accuracy.

Run:  python -m src.newdata_compare
"""
import os, sys, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config as C
from src import newdata_loader as NL
from src.model import build_model as build_cnn
from src.model_cnn_bilstm import build_model as build_bilstm
from src.model_lsam_cnn_bilstm import build_model as build_lsam
import tensorflow as tf, random
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score, f1_score, confusion_matrix

WINDOW, STRIDE = 256, 128
TEST_FRAC, VAL_FRAC = 0.30, 0.20
SEEDS = [42, 7, 123]
DEN_CACHE = os.path.join(C.PROC_DIR, "newdata_denoise.npz")
MODELS = {"1D-CNN": build_cnn, "CNN-BiLSTM": build_bilstm, "LSAM-CNN-BiLSTM": build_lsam}


def emd_denoise(X):
    from PyEMD import EMD
    emd = EMD(); out = np.zeros_like(X)
    for i in range(len(X)):
        imfs = emd(X[i][:, 0])
        out[i, :, 0] = imfs[1:].sum(0) if len(imfs) > 1 else imfs.sum(0)
        if (i + 1) % 40 == 0: print(f"  EMD {i+1}/{len(X)}")
    return out.astype(np.float32)


def windows(sig, stride=STRIDE):
    return [sig[s:s + WINDOW] for s in range(0, len(sig) - WINDOW + 1, stride)]


def to_fft(X):
    return (np.abs(np.fft.rfft(X, axis=1)) / X.shape[1]).astype(np.float32)


def augment(X, yi, seed):
    rng = np.random.default_rng(seed); aX, aY = [X], [yi]
    for _ in range(C.AUG_COPIES):
        x = X * rng.uniform(1 - C.AUG_SCALE, 1 + C.AUG_SCALE, (len(X), 1, X.shape[-1]))
        x = x + rng.normal(0, C.AUG_NOISE, x.shape)
        aX.append(x.astype(np.float32)); aY.append(yi)
    return np.concatenate(aX), np.concatenate(aY)


def seed_all(s):
    os.environ["PYTHONHASHSEED"] = str(s); random.seed(s); np.random.seed(s); tf.random.set_seed(s)


def file_split(y, groups, seed):
    """Stratified file-level split -> train/test group ids."""
    rng = np.random.default_rng(seed); tr, te = [], []
    for cls in NL.CLASS_ORDER:
        gids = np.unique(groups[y == cls]); rng.shuffle(gids)
        n_te = max(1, int(round(TEST_FRAC * len(gids))))
        te += gids[:n_te].tolist(); tr += gids[n_te:].tolist()
    return np.array(tr), np.array(te)


def make_windows(Xd, y, groups, gsel):
    X, Y, G = [], [], []
    for i in np.where(np.isin(groups, gsel))[0]:
        for w in windows(Xd[i]):
            X.append(w); Y.append(y[i]); G.append(groups[i])
    return np.asarray(X, np.float32), np.asarray(Y), np.asarray(G)


def main():
    X, y, groups, meta = NL.load_files()
    print("files", X.shape)
    if os.path.exists(DEN_CACHE):
        Xd = np.load(DEN_CACHE)["Xd"]; print("cached denoise", Xd.shape)
    else:
        print("EMD denoise ..."); Xd = emd_denoise(X); np.savez_compressed(DEN_CACHE, Xd=Xd)

    tr_g, te_g = file_split(y, groups, seed=42)
    Xtr0, ytr0, gtr = make_windows(Xd, y, groups, tr_g)
    Xte0, yte0, gte = make_windows(Xd, y, groups, te_g)
    Xtr0, Xte0 = to_fft(Xtr0), to_fft(Xte0)
    mn = Xtr0.reshape(-1, 1).mean(0); sd = Xtr0.reshape(-1, 1).std(0) + 1e-8
    Xtr0 = (Xtr0 - mn) / sd; Xte0 = (Xte0 - mn) / sd
    le = LabelEncoder().fit(NL.CLASS_ORDER); ncl = len(NL.CLASS_ORDER); L = Xtr0.shape[1]
    ytr = le.transform(ytr0); yte = le.transform(yte0)
    print(f"train win {len(Xtr0)}  test win {len(Xte0)}  bins {L}  test files {len(te_g)}")

    # fixed val split (random 20% of train windows)
    r = np.random.default_rng(0); idx = r.permutation(len(Xtr0)); nv = int(VAL_FRAC * len(idx))
    vi, ti = idx[:nv], idx[nv:]
    Xv, yv = Xtr0[vi], ytr[vi]; Xt, yt = Xtr0[ti], ytr[ti]
    h = le.transform(["Healthy"])[0]

    results = {}
    for name, builder in MODELS.items():
        print(f"\n===== {name} =====")
        probs = []
        for s in SEEDS:
            seed_all(s); Xa, ya = augment(Xt, yt, s)
            p = np.random.default_rng(s).permutation(len(Xa)); Xa, ya = Xa[p], ya[p]
            m = builder(input_len=L, n_channels=1, n_classes=ncl)
            m.fit(Xa, tf.keras.utils.to_categorical(ya, ncl),
                  validation_data=(Xv, tf.keras.utils.to_categorical(yv, ncl)),
                  epochs=C.EPOCHS, batch_size=C.BATCH, verbose=0,
                  callbacks=[tf.keras.callbacks.EarlyStopping(patience=12, restore_best_weights=True),
                             tf.keras.callbacks.ReduceLROnPlateau(patience=6, factor=0.5)])
            probs.append(m.predict(Xte0, verbose=0))
            print(f"  seed {s} window-acc={accuracy_score(yte, probs[-1].argmax(1)):.3f}")
        ens = np.mean(probs, 0); yp = ens.argmax(1)
        win_acc = accuracy_score(yte, yp); win_f1 = f1_score(yte, yp, average="macro")
        # per-file voting
        recs = np.unique(gte); rt, rp = [], []
        for g in recs:
            mk = gte == g; rt.append(yte[mk][0]); rp.append(ens[mk].mean(0).argmax())
        rt, rp = np.array(rt), np.array(rp)
        rec_acc = accuracy_score(rt, rp); rec_f1 = f1_score(rt, rp, average="macro")
        rec_bin = accuracy_score((rt != h).astype(int), (rp != h).astype(int))
        results[name] = {"window_5class": round(float(win_acc), 4),
                         "window_macro_f1": round(float(win_f1), 4),
                         "file_5class": round(float(rec_acc), 4),
                         "file_macro_f1": round(float(rec_f1), 4),
                         "file_binary": round(float(rec_bin), 4)}
        print(f"  -> file 5-class={rec_acc:.4f}  binary={rec_bin:.4f}")

    json.dump(results, open(os.path.join(C.METRIC_DIR, "newdata_compare.json"), "w"), indent=2)
    print("\n================ SUMMARY (time-domain dataset) ================")
    print(f"{'model':<18}{'win 5cls':>9}{'file 5cls':>10}{'file bin':>10}")
    for k, v in results.items():
        print(f"{k:<18}{v['window_5class']:>9}{v['file_5class']:>10}{v['file_binary']:>10}")


if __name__ == "__main__":
    main()
