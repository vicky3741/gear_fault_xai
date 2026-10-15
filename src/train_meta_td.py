"""
FINAL main training: train the 3 architectures (1D-CNN, CNN-BiLSTM, LSAM-CNN-BiLSTM)
on the time-domain dataset (2-channel p1+p2) with the winning pipeline, and SAVE them
so that inference averages all three = the META ensemble.

Pipeline: EMD denoise -> window256/stride32 -> FFT(rfft,/N) -> standardise(train stats)
Leakage-safe within-recording temporal split. Saves to models/time_domain/:
  cnn.keras, cnnbilstm.keras, lsam.keras, preproc.pkl, label_encoder.pkl, shap_background.npy
"""
import os, sys, glob, pickle
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config as C
from src import newdata_loader as NL
from src.newdata_2ch import load_pairs, emd_denoise2, CACHE
from src.newdata_compare import to_fft, augment, seed_all
from src.model import build_model as build_cnn
from src.model_cnn_bilstm import build_model as build_bilstm
from src.model_lsam_cnn_bilstm import build_model as build_lsam
import tensorflow as tf
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score, f1_score

WINDOW = 256
TRAIN_REGION, TEST_REGION = (0, 640), (640, 1024)
TRAIN_STRIDE, TEST_STRIDE = 32, 32
VAL_FRAC = 0.20
SEED = 42
OUT = os.path.join(C.MODEL_DIR, "time_domain")
BUILDERS = {"cnn": build_cnn, "cnnbilstm": build_bilstm, "lsam": build_lsam}


def cut(Xd, y, g, region, stride):
    lo, hi = region; X, Y, G = [], [], []
    for i in range(len(Xd)):
        for s in range(lo, hi - WINDOW + 1, stride):
            X.append(Xd[i][s:s + WINDOW, :]); Y.append(y[i]); G.append(g[i])
    return np.asarray(X, np.float32), np.asarray(Y), np.asarray(G)


def main():
    os.makedirs(OUT, exist_ok=True)
    X, y, g = load_pairs()
    Xd = np.load(CACHE)["Xd"] if os.path.exists(CACHE) else emd_denoise2(X)
    if not os.path.exists(CACHE):
        np.savez_compressed(CACHE, Xd=Xd)

    Xtr0, ytr0, gtr = cut(Xd, y, g, TRAIN_REGION, TRAIN_STRIDE)
    Xte0, yte0, gte = cut(Xd, y, g, TEST_REGION, TEST_STRIDE)
    Xtr0, Xte0 = to_fft(Xtr0), to_fft(Xte0)
    mean = Xtr0.reshape(-1, 2).mean(0); std = Xtr0.reshape(-1, 2).std(0) + 1e-8
    Xtr0 = (Xtr0 - mean) / std; Xte0 = (Xte0 - mean) / std
    le = LabelEncoder().fit(NL.CLASS_ORDER); ncl = len(NL.CLASS_ORDER); L = Xtr0.shape[1]
    ytr = le.transform(ytr0); yte = le.transform(yte0)

    rng = np.random.default_rng(0); idx = rng.permutation(len(Xtr0)); nv = int(VAL_FRAC * len(idx))
    vi, ti = idx[:nv], idx[nv:]; Xv, yv = Xtr0[vi], ytr[vi]; Xt, yt = Xtr0[ti], ytr[ti]

    # clear old seed models so inference averages exactly the 3 architectures
    for f in glob.glob(os.path.join(OUT, "*.keras")):
        os.remove(f)

    probs = []
    for name, builder in BUILDERS.items():
        seed_all(SEED); Xa, ya = augment(Xt, yt, SEED)
        p = np.random.default_rng(SEED).permutation(len(Xa)); Xa, ya = Xa[p], ya[p]
        m = builder(input_len=L, n_channels=2, n_classes=ncl)
        m.fit(Xa, tf.keras.utils.to_categorical(ya, ncl),
              validation_data=(Xv, tf.keras.utils.to_categorical(yv, ncl)),
              epochs=C.EPOCHS, batch_size=C.BATCH, verbose=0,
              callbacks=[tf.keras.callbacks.EarlyStopping(patience=12, restore_best_weights=True),
                         tf.keras.callbacks.ReduceLROnPlateau(patience=6, factor=0.5)])
        m.save(os.path.join(OUT, f"{name}.keras"))
        pr = m.predict(Xte0, verbose=0); probs.append(pr)
        print(f"  saved {name}.keras  window-acc={accuracy_score(yte, pr.argmax(1)):.3f}")

    # META = average of the 3; per-file voting
    ens = np.mean(probs, 0); recs = np.unique(gte); rt, rp = [], []
    for gg in recs:
        mk = gte == gg; rt.append(yte[mk][0]); rp.append(ens[mk].mean(0).argmax())
    rt, rp = np.array(rt), np.array(rp)
    rec_acc = accuracy_score(rt, rp); rec_f1 = f1_score(rt, rp, average="macro")
    h = le.transform(["Healthy"])[0]
    rec_bin = accuracy_score((rt != h).astype(int), (rp != h).astype(int))
    print(f"META(3) file 5-class={rec_acc:.4f}  macroF1={rec_f1:.4f}  binary={rec_bin:.4f}")

    # save preproc + label encoder + SHAP background
    pickle.dump(le, open(os.path.join(OUT, "label_encoder.pkl"), "wb"))
    pickle.dump({"mean": mean, "std": std, "window": WINDOW, "stride": TRAIN_STRIDE,
                 "test_stride": TEST_STRIDE, "classes": list(le.classes_), "use_fft": True,
                 "emd_denoise": True, "drop_imf": 1, "fs": NL.FS, "n_bins": int(L),
                 "n_channels": 2},
                open(os.path.join(OUT, "preproc.pkl"), "wb"))
    bg = Xtr0[np.random.default_rng(SEED).choice(len(Xtr0), min(60, len(Xtr0)), replace=False)]
    np.save(os.path.join(OUT, "shap_background.npy"), bg.astype(np.float32))

    import json
    json.dump({"models": list(BUILDERS.keys()), "meta_file_5class": round(float(rec_acc), 4),
               "meta_macro_f1": round(float(rec_f1), 4), "meta_binary": round(float(rec_bin), 4),
               "n_files": int(len(recs))},
              open(os.path.join(C.METRIC_DIR, "time_domain_meta.json"), "w"), indent=2)
    print("saved models + preproc + background ->", OUT)


if __name__ == "__main__":
    main()
