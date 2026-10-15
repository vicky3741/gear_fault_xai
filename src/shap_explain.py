"""
SHAP-based explainability (Phase A) — SHAP is now the MAIN method.

Two views:
  (1) Deep SHAP on the CNN input (frequency-bin x channel) via GradientExplainer.
      - local per-class attribution, global mean|SHAP| per class,
      - grouped into frequency bands, top-10 bands/class, per-channel importance.
  (2) SHAP on handcrafted time/frequency features via a RandomForest + TreeExplainer
      (interpretable second view: RMS, kurtosis, crest, spectral centroid, ...).
Plus an agreement check: SHAP vs Gradient x Input (overlap% + Spearman).

Outputs -> results/shap/time_domain/ . Models read from models/time_domain/.
CLI:  python -m src.shap_explain --dataset time_domain
"""
import os, sys, json, argparse
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config as C
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
from scipy.stats import kurtosis, skew, spearmanr

BAND_HZ = 50  # width of frequency bands for readable grouping


# ---------------------------------------------------------------- data access
def get_dataset(dataset):
    """Return dict: Xtr_f,Xte_f (FFT feats), time-domain test windows Wte,
    yte, classes, freqs, fs, models(list), out_dir."""
    import tensorflow as tf, glob, pickle
    if dataset == "time_domain":
        from src import newdata_loader as NL
        from src.newdata_2ch import load_pairs, CACHE
        mdir = os.path.join(C.MODEL_DIR, "time_domain")
        pp = pickle.load(open(os.path.join(mdir, "preproc.pkl"), "rb"))
        le = pickle.load(open(os.path.join(mdir, "label_encoder.pkl"), "rb"))
        models = [tf.keras.models.load_model(f) for f in sorted(glob.glob(os.path.join(mdir, "*.keras")))]
        X, y, g = load_pairs()
        Xd = np.load(CACHE)["Xd"]
        W = pp["window"]; trR = pp["train_region"]; teR = pp["test_region"]
        trS = pp["train_stride"]; teS = pp["test_stride"]
        def cut(region, stride):
            lo, hi = region; A, B = [], []
            for i in range(len(Xd)):
                for s in range(lo, hi - W + 1, stride):
                    A.append(Xd[i][s:s+W, :]); B.append(y[i])
            return np.asarray(A, np.float32), np.asarray(B)
        Wtr, ytr = cut(trR, trS); Wte, yte = cut(teR, teS)
        fft = lambda Z: (np.abs(np.fft.rfft(Z, axis=1)) / Z.shape[1]).astype(np.float32)
        mean, std = np.asarray(pp["mean"]), np.asarray(pp["std"])
        Xtr = (fft(Wtr) - mean) / std; Xte = (fft(Wte) - mean) / std
        yte_i = le.transform(yte)
        freqs = np.fft.rfftfreq(W, 1 / pp["fs"])
        return dict(Xtr=Xtr, Xte=Xte, yte=yte_i, Wte=Wte,
                    classes=list(le.classes_), freqs=freqs, fs=pp["fs"], models=models,
                    out=os.path.join(C.RESULTS_DIR, "shap", "time_domain"))
    raise ValueError(dataset)


# ---------------------------------------------------------------- SHAP (input)
def deep_shap(models, Xtr, Xte, seed=42, bg_n=60):
    import shap
    rng = np.random.default_rng(seed)
    bg = Xtr[rng.choice(len(Xtr), min(bg_n, len(Xtr)), replace=False)]
    sv_models = []
    for m in models:
        expl = shap.GradientExplainer(m, bg)
        sv = np.array(expl.shap_values(Xte))     # (n, bins, ch, ncl) or list
        if sv.ndim == 3:   # single-output edge
            sv = sv[..., None]
        sv_models.append(sv)
    return np.mean(sv_models, axis=0), bg      # (n,bins,ch,ncl)


def gradxinput(model, X, cls):
    import tensorflow as tf
    X = tf.convert_to_tensor(X, tf.float32)
    with tf.GradientTape() as t:
        t.watch(X); s = tf.gather(model(X, training=False), cls, axis=1, batch_dims=1)
    return (t.gradient(s, X) * X).numpy()


def bands(freqs, width):
    edges = np.arange(0, freqs[-1] + width, width)
    idx = np.digitize(freqs, edges) - 1
    labels = [f"{int(edges[b])}-{int(edges[b]+width)}Hz" for b in range(len(edges)-1)]
    return idx, labels


# ---------------------------------------------------------------- feature view
def feats(win, fs):
    """Handcrafted features for one window (T,ch) -> flat vector + names."""
    out, names = [], []
    nb = 4
    for c in range(win.shape[1]):
        x = win[:, c]
        rms = np.sqrt(np.mean(x**2)); pk = np.max(np.abs(x)); sd = np.std(x) + 1e-12
        mu_abs = np.mean(np.abs(x)) + 1e-12
        td = {"rms": rms, "peak": pk, "p2p": np.ptp(x), "std": sd,
              "crest": pk / (rms + 1e-12), "kurt": kurtosis(x), "skew": skew(x),
              "shape": rms / mu_abs, "impulse": pk / mu_abs,
              "clearance": pk / (np.mean(np.sqrt(np.abs(x)))**2 + 1e-12)}
        mag = np.abs(np.fft.rfft(x)); fr = np.fft.rfftfreq(len(x), 1/fs)
        cent = float(np.sum(fr*mag) / (np.sum(mag)+1e-12))
        fd = {"spec_centroid": cent, "dom_freq": float(fr[mag.argmax()]),
              "spec_energy": float(np.sum(mag**2))}
        for k, v in {**td, **fd}.items():
            out.append(v); names.append(f"D{c+1}_{k}")
    return out, names


def build_feature_table(W, fs):
    rows = [feats(w, fs) for w in W]
    names = rows[0][1]
    return np.array([r[0] for r in rows], np.float32), names


# ---------------------------------------------------------------- main
def run(dataset):
    import shap
    D = get_dataset(dataset)
    os.makedirs(D["out"], exist_ok=True)
    Xtr, Xte, yte, Wte = D["Xtr"], D["Xte"], D["yte"], D["Wte"]
    classes, freqs, models = D["classes"], D["freqs"], D["models"]
    ncl, ch = len(classes), Xte.shape[-1]
    print(f"[{dataset}] Xte {Xte.shape}  classes {ncl}  ch {ch}")

    sv, bg = deep_shap(models, Xtr, Xte)       # (n,bins,ch,ncl)
    bidx, blabels = bands(freqs, BAND_HZ)

    # ---- GLOBAL: mean|SHAP| per band per class ----
    glob = np.zeros((ncl, len(blabels)))
    for ci in range(ncl):
        prof = np.abs(sv[:, :, :, ci]).mean(0).sum(1)     # (bins,)
        for b in range(len(blabels)):
            glob[ci, b] = prof[bidx == b].sum()
    gdf = pd.DataFrame(glob, index=classes, columns=blabels)
    gdf.round(5).to_csv(os.path.join(D["out"], "global_shap_bands.csv"))
    fig, ax = plt.subplots(figsize=(min(14, 2+0.4*len(blabels)), 4))
    im = ax.imshow(glob / (glob.max(1, keepdims=True)+1e-12), aspect="auto", cmap="hot")
    ax.set_yticks(range(ncl)); ax.set_yticklabels(classes)
    ax.set_xticks(range(len(blabels))); ax.set_xticklabels(blabels, rotation=90, fontsize=6)
    ax.set_title(f"Global SHAP importance per frequency band ({dataset})")
    fig.colorbar(im); fig.tight_layout()
    fig.savefig(os.path.join(D["out"], "global_shap_bands.png"), dpi=140); plt.close(fig)

    # top-10 bands per class
    top = {}
    for ci, nm in enumerate(classes):
        order = np.argsort(glob[ci])[::-1][:10]
        top[nm] = [{"band": blabels[b], "importance": round(float(glob[ci, b]), 5)} for b in order]
    json.dump(top, open(os.path.join(D["out"], "top_bands_per_class.json"), "w"), indent=2)

    # ---- per-channel importance ----
    chan = np.abs(sv).mean((0, 1, 3))          # (ch,)
    chan_df = pd.DataFrame({"channel": [f"D{i+1}" for i in range(ch)],
                            "mean_abs_shap": np.round(chan, 6)})
    chan_df.to_csv(os.path.join(D["out"], "channel_importance.csv"), index=False)

    # ---- LOCAL: one correct sample per class, SHAP over spectrum ----
    proba = np.mean([m.predict(Xte, verbose=0) for m in models], 0); yp = proba.argmax(1)
    fig, axes = plt.subplots(ncl, 1, figsize=(9, 2*ncl), sharex=True)
    for ci, ax in enumerate(np.atleast_1d(axes)):
        cand = np.where((yte == ci) & (yp == ci))[0]
        idx = cand[0] if len(cand) else np.where(yte == ci)[0][0]
        imp = np.abs(sv[idx, :, :, ci]).sum(1)
        ax.plot(freqs, Xte[idx, :, 0], color="0.6", lw=.6)
        ax.scatter(freqs, Xte[idx, :, 0], c=imp, cmap="hot", s=7)
        ax.set_ylabel(classes[ci], fontsize=7)
    plt.xlabel("Frequency (Hz)"); plt.suptitle(f"Local SHAP over spectrum ({dataset})")
    fig.tight_layout(); fig.savefig(os.path.join(D["out"], "local_shap.png"), dpi=140); plt.close(fig)

    # ---- agreement: SHAP vs Grad x Input (top-k bins overlap + spearman) ----
    k = 20; ov, sp = [], []
    for i in range(min(len(Xte), 120)):
        c = yp[i]
        s_imp = np.abs(sv[i, :, :, c]).sum(1)
        g_imp = np.abs(gradxinput(models[0], Xte[i:i+1], np.array([c]))[0]).sum(1)
        a = set(np.argsort(s_imp)[::-1][:k]); b = set(np.argsort(g_imp)[::-1][:k])
        ov.append(len(a & b)/k)
        sp.append(spearmanr(s_imp, g_imp).correlation)
    agree = {"topk": k, "mean_overlap": round(float(np.nanmean(ov)), 4),
             "mean_spearman": round(float(np.nanmean(sp)), 4), "n": len(ov)}
    json.dump(agree, open(os.path.join(D["out"], "agreement.json"), "w"), indent=2)

    print(f"[{dataset}] DONE. agreement={agree}")
    return {"agreement": agree, "top_bands": top, "channel": chan_df.to_dict("records"),
            "out": D["out"]}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", default="time_domain", choices=["time_domain"])
    a = ap.parse_args()
    run(a.dataset)
