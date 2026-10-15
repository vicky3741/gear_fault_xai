"""
Meta-ensemble on the 2-channel time-domain dataset.
Average the softmax of ALL three architectures x 5 seeds (15 models), then
per-file voting. Different models err on different files -> combining lifts accuracy.
Same leakage-safe within-file temporal split + EMD denoise + FFT + stride-32 overlap.
"""
import os, sys, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config as C
from src import newdata_loader as NL
from src.newdata_2ch import load_pairs, emd_denoise2, CACHE
from src.newdata_compare import to_fft, augment, seed_all
from src.newdata_push import cut, TRAIN_REGION, TEST_REGION, TRAIN_STRIDE, TEST_STRIDE, WINDOW, VAL_FRAC
from src.model import build_model as build_cnn
from src.model_cnn_bilstm import build_model as build_bilstm
from src.model_lsam_cnn_bilstm import build_model as build_lsam
import tensorflow as tf
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score, f1_score, confusion_matrix

SEEDS = [42, 7, 123, 2024, 99]
MODELS = {"1D-CNN": build_cnn, "CNN-BiLSTM": build_bilstm, "LSAM-CNN-BiLSTM": build_lsam}


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
    r = np.random.default_rng(0); idx = r.permutation(len(Xtr0)); nv = int(VAL_FRAC*len(idx))
    vi, ti = idx[:nv], idx[nv:]; Xv, yv = Xtr0[vi], ytr[vi]; Xt, yt = Xtr0[ti], ytr[ti]
    h = le.transform(["Healthy"])[0]; recs = np.unique(gte)

    def vote(prob_stack):
        ens = np.mean(prob_stack, 0)
        rt, rp = [], []
        for gg in recs:
            mk = gte == gg; rt.append(yte[mk][0]); rp.append(ens[mk].mean(0).argmax())
        rt, rp = np.array(rt), np.array(rp)
        return (accuracy_score(rt, rp), f1_score(rt, rp, average="macro"),
                accuracy_score((rt != h).astype(int), (rp != h).astype(int)), rt, rp)

    all_probs = []; per_model = {}
    for name, builder in MODELS.items():
        print(f"\n===== {name} =====")
        mprobs = []
        for s in SEEDS:
            seed_all(s); Xa, ya = augment(Xt, yt, s)
            p = np.random.default_rng(s).permutation(len(Xa)); Xa, ya = Xa[p], ya[p]
            m = builder(input_len=L, n_channels=2, n_classes=ncl)
            m.fit(Xa, tf.keras.utils.to_categorical(ya, ncl),
                  validation_data=(Xv, tf.keras.utils.to_categorical(yv, ncl)),
                  epochs=C.EPOCHS, batch_size=C.BATCH, verbose=0,
                  callbacks=[tf.keras.callbacks.EarlyStopping(patience=12, restore_best_weights=True),
                             tf.keras.callbacks.ReduceLROnPlateau(patience=6, factor=0.5)])
            pr = m.predict(Xte0, verbose=0); mprobs.append(pr); all_probs.append(pr)
        acc, f1, binacc, _, _ = vote(mprobs)
        per_model[name] = {"file_5class": round(float(acc), 4), "file_binary": round(float(binacc), 4)}
        print(f"  {name} file 5-class={acc:.4f}  binary={binacc:.4f}")

    macc, mf1, mbin, rt, rp = vote(all_probs)
    res = {"per_model": per_model,
           "META_ensemble_file_5class": round(float(macc), 4),
           "META_ensemble_macro_f1": round(float(mf1), 4),
           "META_ensemble_binary": round(float(mbin), 4),
           "n_files": int(len(recs)), "n_models": len(all_probs)}
    json.dump(res, open(os.path.join(C.METRIC_DIR, "newdata_meta.json"), "w"), indent=2)
    print("\n================ META-ENSEMBLE (all 3 models x 5 seeds) ================")
    for k, v in per_model.items():
        print(f"  {k:<18} 5cls={v['file_5class']}  bin={v['file_binary']}")
    print(f"  {'META (3 models)':<18} 5cls={macc:.4f}  bin={mbin:.4f}")
    print("confusion (meta):\n", confusion_matrix(rt, rp))


if __name__ == "__main__":
    main()
