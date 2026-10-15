"""
Honest accuracy push on the 2-channel (p1+p2) time-domain dataset.
Best combo, no leakage:
  EMD denoise -> window 256 stride 32 (87.5% overlap) -> FFT(rfft,/N) -> standardise
  -> augment(train) -> 5-seed ensemble -> per-file voting (dense test windows)
Within-file temporal split (train region vs test region share no samples).
Runs all three models; LSAM is the headline.
"""
import os, sys, json
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
from sklearn.metrics import accuracy_score, f1_score, confusion_matrix

WINDOW = 256
TRAIN_REGION, TEST_REGION = (0, 640), (640, 1024)
TRAIN_STRIDE, TEST_STRIDE = 32, 32          # 87.5% overlap
VAL_FRAC = 0.20
SEEDS = [42, 7, 123, 2024, 99]              # 5-seed ensemble
MODELS = {"1D-CNN": build_cnn, "CNN-BiLSTM": build_bilstm, "LSAM-CNN-BiLSTM": build_lsam}


def cut(Xd, y, g, region, stride):
    lo, hi = region; X, Y, G = [], [], []
    for i in range(len(Xd)):
        for s in range(lo, hi - WINDOW + 1, stride):
            X.append(Xd[i][s:s + WINDOW, :]); Y.append(y[i]); G.append(g[i])
    return np.asarray(X, np.float32), np.asarray(Y), np.asarray(G)


def main():
    X, y, g = load_pairs()
    Xd = np.load(CACHE)["Xd"] if os.path.exists(CACHE) else emd_denoise2(X)
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
        if name == "LSAM-CNN-BiLSTM":
            print("confusion (file):\n", confusion_matrix(rt, rp))

    json.dump(results, open(os.path.join(C.METRIC_DIR, "newdata_push.json"), "w"), indent=2)
    print("\n====== PUSH SUMMARY (2-ch, stride32, 5-seed) ======")
    print(f"{'model':<18}{'win 5cls':>9}{'file 5cls':>10}{'file bin':>10}")
    for k, v in results.items():
        print(f"{k:<18}{v['window_5class']:>9}{v['file_5class']:>10}{v['file_binary']:>10}")


if __name__ == "__main__":
    main()
