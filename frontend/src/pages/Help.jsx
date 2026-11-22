import { useState } from "react";
import {
  AudioWaveform, BellRing, Boxes, ChevronDown, FileText, Filter, Layers, Merge, ScanSearch, Scissors, Sparkles, Waves,
} from "lucide-react";
import { useApp } from "../context/AppContext.jsx";
import { SEVERITY } from "../theme/severity.js";
import { modelName } from "../lib/format.js";
import { SectionCard, SeverityBadge, SeverityScale } from "../components/ui";

const GLOSSARY = [
  ["EMD", "Empirical Mode Decomposition. Splits a signal into intrinsic mode functions (IMFs). Dropping the first IMF removes the highest-frequency noise."],
  ["Window", "A short slice of the recording. Overlapping windows give the model many views of one file."],
  ["FFT", "Fast Fourier Transform. Turns a window of samples into an amplitude spectrum: how much vibration energy sits at each frequency."],
  ["1D-CNN", "A convolutional network that learns local patterns along the spectrum."],
  ["CNN-BiLSTM", "A CNN followed by a bidirectional LSTM that reads the learned features in both directions."],
  ["LSAM-CNN-BiLSTM", "Adds a Lightweight Subspace Attention Module that re-weights the most informative feature channels before the BiLSTM."],
  ["META ensemble", "Averages the class probabilities of the three networks. Different models make different mistakes, so the average is steadier."],
  ["Per-recording voting", "The probabilities of all windows of a recording are averaged into one result."],
  ["SHAP", "SHapley Additive exPlanations (GradientExplainer here). Estimates how much each input frequency pushed the prediction."],
  ["Gradient×Input", "A second, simpler attribution method. Agreement with SHAP is a sanity check of the explanation."],
  ["Leakage-free", "Training and test windows come from different time regions of each recording and never share samples."],
  ["Confidence", "The mean ensemble probability of the predicted class. Below 60% the dashboard flags the result as uncertain."],
];

const FAQ = [
  ["Does this monitor the machine continuously?",
    "No. It diagnoses recorded vibration files (Excel files with sensors p1 and p2). Each diagnosis is one recording."],
  ["Is the SHAP explanation proof of where the defect is?",
    "No. SHAP shows which frequencies the model relied on. Locating a physical defect needs component geometry, which this dataset does not include."],
  ["Why is the deployed accuracy lower than the best experiment?",
    "The deployed ensemble keeps one seed per architecture (3 models). The reference experiment averaged 3 architectures × 5 seeds (15 models). Both are on the Model Performance tab."],
  ["When is a Telegram alert sent?",
    "Only when a new diagnosis moves the machine up into 50%, 75% or 100% compared with the previous diagnosis. Staying at the same level, or going down, sends nothing. Batch runs never send alerts."],
  ["Is the Batch accuracy a test score?",
    "No. Batch diagnoses whole recordings, which include the time region used for training. Use Model Performance for leakage-free scores."],
  ["Can I upload my own file?",
    "Not at the moment: the server only accepts recordings from the configured dataset."],
  ["Where do the numbers come from?",
    "Every number is read from the API: the model outputs, results/metrics, results/shap and the history database. Nothing is typed into the page."],
];

function Step({ icon: Icon, title, detail, accent }) {
  return (
    <li className="relative flex min-w-0 flex-1 flex-col items-center text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line"
        style={{ background: accent ? "linear-gradient(135deg, rgb(var(--c-primary) / .25), rgb(var(--c-secondary) / .25))" : "rgb(var(--c-raised))" }}>
        <Icon size={20} className="text-primary" aria-hidden />
      </div>
      <p className="mt-2 text-sm font-semibold text-fg">{title}</p>
      {detail && <p className="mt-0.5 font-mono text-[11px] leading-snug text-muted">{detail}</p>}
    </li>
  );
}

export default function Help() {
  const { dataset } = useApp();
  const pp = dataset?.preprocessing;
  const [openQ, setOpenQ] = useState(0);
  const models = (dataset?.models || []).map(modelName);

  const steps = [
    { icon: AudioWaveform, title: "Signal", detail: pp ? `p1 + p2 · ${pp.fs} Hz` : "p1 + p2" },
    { icon: Filter, title: "EMD denoise", detail: pp?.emd_denoise ? `drop IMF-${pp.emd_drop_imf}` : null },
    { icon: Scissors, title: "Windowing", detail: pp ? `${pp.window} samples · stride ${pp.stride}` : null },
    { icon: Waves, title: "FFT", detail: pp ? `${pp.n_bins} bins · standardised` : null },
    { icon: Boxes, title: `${models.length || 3} models`, detail: models.join(" · ") || null },
    { icon: Merge, title: "META", detail: "average + per-recording vote", accent: true },
    { icon: Sparkles, title: "SHAP", detail: "+ Gradient×Input" },
    { icon: BellRing, title: "Alert / PDF", detail: "Telegram ≥ 50% · report" },
  ];

  return (
    <div className="space-y-6">
      <SectionCard index={1} eyebrow="Pipeline" title="From vibration file to diagnosis"
        subtitle="What happens when you press Run Diagnosis. The numbers come from the deployed preprocessing file.">
        <ol className="grid grid-cols-2 gap-y-6 sm:grid-cols-4 xl:flex xl:items-start xl:gap-2">
          {steps.map((s, i) => (
            <div key={s.title} className="contents">
              <Step {...s} />
              {i < steps.length - 1 && <li aria-hidden className="hidden pt-5 text-muted xl:block">→</li>}
            </div>
          ))}
        </ol>
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <SectionCard index={2} eyebrow="Legend" title="Severity colours" className="xl:col-span-5"
          subtitle="The same five colours are used on every tab.">
          <SeverityScale />
          <ul className="mt-5 space-y-3">
            {SEVERITY.map(s => (
              <li key={s.cls} className="flex gap-3">
                <span className="w-32 shrink-0"><SeverityBadge cls={s.cls} size="sm" /></span>
                <span className="text-sm text-muted">{s.guidance}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">Maintenance text is guidance, not a rule.</p>
        </SectionCard>

        <SectionCard index={3} eyebrow="Glossary" title="Terms used on this dashboard" className="xl:col-span-7">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
            {GLOSSARY.map(([t, d]) => (
              <div key={t} className="rounded-xl border border-line bg-raised/40 px-4 py-3">
                <dt className="text-sm font-semibold text-fg">{t}</dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-muted">{d}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <SectionCard index={4} eyebrow="FAQ" title="Common questions" className="xl:col-span-8">
          <div className="divide-y divide-line rounded-xl border border-line">
            {FAQ.map(([q, a], i) => (
              <div key={q}>
                <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-fg hover:bg-raised/50"
                  aria-expanded={openQ === i} onClick={() => setOpenQ(openQ === i ? -1 : i)}>
                  {q}
                  <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${openQ === i ? "rotate-180" : ""}`} aria-hidden />
                </button>
                {openQ === i && <p className="px-4 pb-4 text-sm text-muted">{a}</p>}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard index={5} eyebrow="Tabs" title="Where to find what" className="xl:col-span-4">
          <ul className="space-y-3 text-sm">
            {[
              [ScanSearch, "Live Diagnosis", "diagnose one recording, model votes, signal, PDF"],
              [Sparkles, "Explainability", "SHAP bands, spectrum overlay, model comparison"],
              [Layers, "Global Insights", "dataset-wide SHAP, class spectra, coverage"],
              [FileText, "Model Performance", "leakage-free scores, experiments, confusion matrix"],
            ].map(([Icon, t, d]) => (
              <li key={t} className="flex gap-3">
                <Icon size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                <span><b className="text-fg">{t}</b> <span className="text-muted">· {d}</span></span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
