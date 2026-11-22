import { useMemo, useState } from "react";
import { Brush, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Waves } from "lucide-react";
import { api } from "../api/client.js";
import { useApi } from "../hooks/useApi.js";
import { useTheme } from "../theme/ThemeContext.jsx";
import { ChartTooltip, EmptyState, ErrorCard, LegendItem, MetricChip, SectionCard, Segmented, Skeleton } from "./ui";

const fmt = v => (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? Number(v).toExponential(2) : Number(v).toFixed(3));

/** Time-domain waveform (p1, p2) and amplitude spectrum of one recording, with a zoom brush. */
export default function SignalView({ sampleId, index = 4 }) {
  const { colors } = useTheme();
  const [view, setView] = useState("wave");
  const sig = useApi(opts => api.signal({ sampleId }, opts), [sampleId], { enabled: !!sampleId });
  const d = sig.data;

  const wave = useMemo(() => (d ? d.t.map((t, i) => ({ x: +(t * 1000).toFixed(3), p1: d.signal.p1?.[i], p2: d.signal.p2?.[i] })) : []), [d]);
  // drop the DC bin (index 0) so the offset does not flatten the rest of the spectrum
  const spec = useMemo(() => (d ? d.fft.freqs.slice(1).map((f, i) => ({ x: +f.toFixed(2), p1: d.fft.p1?.[i + 1], p2: d.fft.p2?.[i + 1] })) : []), [d]);
  const data = view === "wave" ? wave : spec;
  const xLabel = view === "wave" ? "Time (ms)" : "Frequency (Hz)";

  return (
    <SectionCard index={index} eyebrow="Signal view" title={view === "wave" ? "Vibration waveform" : "Amplitude spectrum"}
      subtitle={sampleId ? `Recording ${sampleId.split("|")[1]} · sensors p1 and p2` : "Select a recording to view its signal"}
      actions={
        <>
          {d && <MetricChip label="fs" value={`${d.fs} Hz`} />}
          {d && <MetricChip label="samples" value={d.n_samples} />}
          {d && <MetricChip label="length" value={`${(d.duration_s * 1000).toFixed(0)} ms`} />}
          <Segmented size="sm" value={view} onChange={setView}
            options={[{ value: "wave", label: "Waveform" }, { value: "spec", label: "Spectrum (FFT)" }]} />
        </>
      }>
      {!sampleId && <EmptyState icon={Waves}>Pick a recording in <b>01 · Configuration</b> to see its waveform.</EmptyState>}
      {sig.error && <ErrorCard error={sig.error} onRetry={sig.reload} title="Could not load the signal" />}
      {sig.loading && <Skeleton className="h-72 w-full" />}
      {d && !sig.loading && (
        <>
          <div className="mb-2 flex flex-wrap gap-4">
            <LegendItem color={colors.primary} label="p1 (position 1)" />
            <LegendItem color={colors.secondary} label="p2 (position 2)" />
            <span className="text-xs text-muted">Drag the handles under the chart to zoom.</span>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 16, bottom: 20, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.line} />
                <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} stroke={colors.line} tick={{ fontSize: 11 }}
                  tickFormatter={v => Math.round(v)}
                  label={{ value: xLabel, position: "insideBottom", offset: -12, fill: colors.muted, fontSize: 12 }} />
                <YAxis stroke={colors.line} tick={{ fontSize: 11 }} width={64} tickFormatter={fmt}
                  label={{ value: view === "wave" ? "Amplitude" : "|FFT| / N", angle: -90, position: "insideLeft", fill: colors.muted, fontSize: 12 }} />
                <Tooltip cursor={{ stroke: colors.muted, strokeDasharray: "4 4" }}
                  content={<ChartTooltip labelUnit={view === "wave" ? "ms" : "Hz"} valueFormatter={fmt} />} />
                <Line dataKey="p1" name="p1" dot={false} strokeWidth={1.4} stroke={colors.primary} isAnimationActive={false} />
                <Line dataKey="p2" name="p2" dot={false} strokeWidth={1.4} stroke={colors.secondary} isAnimationActive={false} strokeOpacity={0.85} />
                <Brush dataKey="x" height={22} stroke={colors.primary} fill={colors.raised} travellerWidth={8} tickFormatter={() => ""} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-xs text-muted">
            Raw recorded signal, before EMD denoising{view === "spec" ? "; FFT of the whole recording, DC bin hidden" : ""}.
            The model itself uses EMD-denoised windows of <span className="font-mono">{d.window}</span> samples
            (stride <span className="font-mono">{d.stride}</span>) → FFT.
          </p>
        </>
      )}
    </SectionCard>
  );
}
