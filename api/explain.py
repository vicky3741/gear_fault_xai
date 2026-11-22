"""
On-demand explanations for a single recording, reusing the shared pipeline.
Returns plot DATA (arrays), not images, so the frontend draws interactive charts.
"""
import os
import numpy as np

import config as C
from src import inference as INF


def _freqs(pp):
    return np.fft.rfftfreq(pp["window"], 1.0 / pp["fs"])


def _bands(freqs, imp, width=5.0):
    """Group per-bin importance into `width`-Hz bands -> list of {band, lo, hi, importance}."""
    out = []
    fmax = float(freqs[-1])
    edges = np.arange(0, fmax + width, width)
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (freqs >= lo) & (freqs < hi)
        if m.any():
            out.append({"band": f"{lo:.0f}-{hi:.0f}Hz", "lo": float(lo), "hi": float(hi),
                        "importance": float(np.abs(imp[m]).sum())})
    return out


def _gradxinput(model, X, cls):
    import tensorflow as tf
    xt = tf.convert_to_tensor(X, tf.float32)
    with tf.GradientTape() as tp:
        tp.watch(xt)
        s = model(xt, training=False)[:, cls]
    g = tp.gradient(s, xt).numpy()
    return g * X                                          # (n,bins,ch)


def explain_recording(dataset, raw, target_class=None, band_width=5.0, model=None):
    """
    SHAP (GradientExplainer) + Gradient x Input for a recording.
    Returns band-level importance, top-10 bands, per-channel importance,
    and an agreement overlap between the two methods.
    `model` = file stem of the ensemble member to explain (e.g. "cnn", "cnnbilstm", "lsam");
    default None keeps the original behaviour (the first model, 1D-CNN).
    """
    import shap
    b = INF.load_bundle(dataset)
    pp, le, models = b["pp"], b["le"], b["models"]
    classes = list(le.classes_)
    X, starts = INF.preprocess_recording(raw, pp)
    freqs = _freqs(pp)

    probs = np.mean([m.predict(X, verbose=0) for m in models], axis=0)
    pred = int(probs.mean(0).argmax())
    tgt = pred if target_class is None else classes.index(target_class)

    # background (cached during training), else a slice of this recording
    bgfile = os.path.join(b["info"]["dir"], "shap_background.npy")
    bg = np.load(bgfile) if os.path.exists(bgfile) else X[: min(40, len(X))]
    stems = [os.path.splitext(f)[0] for f in b["model_files"]]
    if model is None:
        mi = 0
    elif model in stems:
        mi = stems.index(model)
    else:
        raise ValueError(f"unknown model '{model}' (choose from {', '.join(stems)})")
    model0 = models[mi]
    expl = shap.GradientExplainer(model0, bg)
    sv = np.array(expl.shap_values(X))                     # (n,bins,ch,ncl) or list
    if sv.ndim == 4:
        shap_tgt = sv[..., tgt]                            # (n,bins,ch)
    else:
        shap_tgt = sv[tgt]
    shap_bin = np.abs(shap_tgt).mean(0).sum(1)             # (bins,) over windows+channels
    gxi = np.abs(_gradxinput(model0, X, tgt)).mean(0).sum(1)

    shap_bands = _bands(freqs, shap_bin, band_width)
    gxi_bands = _bands(freqs, gxi, band_width)
    top10 = sorted(shap_bands, key=lambda d: -d["importance"])[:10]

    # per-channel importance (SHAP)
    ch_imp = np.abs(shap_tgt).mean((0, 1))                 # (ch,)
    ch_names = [f"P{i+1}" for i in range(X.shape[2])]

    # agreement: overlap of top-k bins
    k = 20
    a = set(np.argsort(shap_bin)[::-1][:k].tolist())
    c = set(np.argsort(gxi)[::-1][:k].tolist())
    overlap = len(a & c) / k

    return {
        "dataset": dataset, "classes": classes,
        "predicted_class": classes[pred], "target_class": classes[tgt],
        "frequencies": freqs.tolist(),
        "shap_per_bin": shap_bin.tolist(),
        "gradxinput_per_bin": gxi.tolist(),
        "shap_bands": shap_bands,
        "top10_bands": top10,
        "channel_importance": {ch_names[i]: float(ch_imp[i]) for i in range(len(ch_names))},
        "agreement_overlap_topk": overlap,
        "agreement_topk": k,
        "explained_model": stems[mi],
        "available_models": stems,
        "n_windows": int(len(starts)),
    }


def explanation_sentence(top10, predicted_class):
    """Template-based plain-language summary (no LLM)."""
    if not top10:
        return f"The model predicted {predicted_class}."
    b1 = top10[0]["band"]
    b2 = top10[1]["band"] if len(top10) > 1 else None
    reg = f"the {b1} band" + (f" and the {b2} band" if b2 else "")
    return (f"The model predicted {predicted_class} mainly because of energy in {reg} "
            f"of the vibration spectrum. This indicates which frequencies the model relied "
            f"on, not a proven physical defect.")
