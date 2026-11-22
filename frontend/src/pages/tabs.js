import { Activity, BarChart3, CircleHelp, Globe2, History, Layers, Sparkles } from "lucide-react";

// The 7 tabs, with the hero text each one shows.
export const TABS = [
  { id: "live", label: "Live Diagnosis", icon: Activity,
    eyebrow: "Vibration diagnosis", title: "Bearing health diagnosis",
    subtitle: "Pick a recorded vibration file and the 3-model ensemble grades its fault severity." },
  { id: "explain", label: "Explainability", icon: Sparkles,
    eyebrow: "Explainable AI", title: "Why the model decided",
    subtitle: "SHAP and Gradient×Input show which frequency bands drove a diagnosis." },
  { id: "global", label: "Global Insights", icon: Globe2,
    eyebrow: "Dataset-wide patterns", title: "What the model relies on overall",
    subtitle: "Global SHAP importance per class, sensor channel and frequency band." },
  { id: "performance", label: "Model Performance", icon: BarChart3,
    eyebrow: "Evaluation", title: "How accurate the models are",
    subtitle: "Leakage-free scores read from the saved result files." },
  { id: "batch", label: "Batch", icon: Layers,
    eyebrow: "Batch analysis", title: "Diagnose many recordings at once",
    subtitle: "Run the ensemble over recorded files and compare with their true labels." },
  { id: "history", label: "History", icon: History,
    eyebrow: "Diagnosis log", title: "Past diagnoses",
    subtitle: "Every saved diagnosis, with its severity and PDF report." },
  { id: "help", label: "Help", icon: CircleHelp,
    eyebrow: "Guide", title: "How this dashboard works",
    subtitle: "Pipeline, colour legend, glossary and common questions." },
];

export const tabById = id => TABS.find(t => t.id === id) || TABS[0];
