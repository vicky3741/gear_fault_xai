"""Generate a PDF report for a stored prediction using matplotlib."""
import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

import config as C

GUIDANCE = {
    "Healthy": "No action required. Continue routine monitoring.",
    "Severity-25": "Minor fault indicated. Monitor more frequently and plan inspection.",
    "Severity-50": "Moderate fault. Schedule maintenance at the next opportunity.",
    "Severity-75": "Severe fault. Plan corrective maintenance soon.",
    "Severity-100": "Critical fault. Inspect and repair at the earliest; risk of failure.",
}
REASON = {
    "Healthy": "Running smoothly; vibration is even and no fault frequency stands out.",
    "Severity-25": "A small defect has started; weak repeated impacts add a little extra "
                   "high-frequency vibration, often too small to feel.",
    "Severity-50": "The defect has grown; stronger, regular impacts put more energy into the "
                   "fault-related frequency bands.",
    "Severity-75": "Advanced fault; large sharp impacts each rotation make the vibration rough "
                   "and spread across many frequencies.",
    "Severity-100": "Fully developed fault; very strong broadband vibration and large peaks; "
                    "failure can happen soon.",
}


def build_pdf(result, out_path):
    cls = result["predicted_class"]
    classes = result["classes"]
    mp = result["mean_probabilities"]
    with PdfPages(out_path) as pdf:
        fig = plt.figure(figsize=(8.3, 11.7))                 # A4 portrait
        fig.suptitle("Vibration Fault Diagnosis Report", fontsize=15, y=0.97)

        ax0 = fig.add_axes([0.1, 0.72, 0.8, 0.18]); ax0.axis("off")
        lines = [
            f"Dataset: {result['dataset']}",
            f"Predicted condition: {cls}",
            f"Binary verdict: {result['binary_verdict']}",
            f"Confidence: {result['confidence']*100:.1f}%"
            + ("  (LOW CONFIDENCE)" if result.get("low_confidence") else ""),
            f"Windows analysed: {result['n_windows']}",
        ]
        ax0.text(0, 1, "\n".join(lines), va="top", fontsize=11, family="monospace")

        ax1 = fig.add_axes([0.12, 0.42, 0.76, 0.24])
        vals = [mp[c] for c in classes]
        ax1.bar(classes, vals, color="steelblue")
        ax1.set_ylim(0, 1); ax1.set_title("Class probabilities")
        ax1.tick_params(axis="x", rotation=30)

        axr = fig.add_axes([0.1, 0.30, 0.8, 0.10]); axr.axis("off")
        axr.text(0, 1, "Why this condition:\n" + REASON.get(cls, ""),
                 va="top", fontsize=10, wrap=True)

        ax2 = fig.add_axes([0.1, 0.20, 0.8, 0.09]); ax2.axis("off")
        ax2.text(0, 1, "Maintenance guidance (not a rule):\n" + GUIDANCE.get(cls, ""),
                 va="top", fontsize=10, wrap=True)

        ax3 = fig.add_axes([0.1, 0.06, 0.8, 0.1]); ax3.axis("off")
        ax3.text(0, 1, "Note: SHAP/saliency indicate which frequencies the model relied on; "
                       "they are not proof of a physical defect.", va="top", fontsize=9,
                 style="italic", wrap=True)
        pdf.savefig(fig); plt.close(fig)
    return out_path
