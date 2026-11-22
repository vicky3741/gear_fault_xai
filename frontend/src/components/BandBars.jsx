import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "../theme/ThemeContext.jsx";
import { ChartTooltip } from "./ui";

/**
 * Horizontal bar chart of frequency bands, most important on top.
 * bands: [{ band: "130-135Hz", value: number }]
 */
export default function BandBars({ bands, color, valueFormatter = v => v, xLabel = "Importance", name = "Importance" }) {
  const { colors } = useTheme();
  const c = color || colors.primary;
  const max = Math.max(...bands.map(b => b.value), 0) || 1;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={bands} layout="vertical" margin={{ top: 4, right: 24, bottom: 18, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.line} horizontal={false} />
        <XAxis type="number" stroke={colors.line} tick={{ fontSize: 11 }} tickFormatter={valueFormatter}
          label={{ value: xLabel, position: "insideBottom", offset: -10, fill: colors.muted, fontSize: 12 }} />
        <YAxis type="category" dataKey="band" width={92} stroke={colors.line}
          tick={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace" }} interval={0} />
        <Tooltip cursor={{ fill: colors.raised }} content={<ChartTooltip valueFormatter={valueFormatter} />} />
        <Bar dataKey="value" name={name} radius={[0, 6, 6, 0]} isAnimationActive={false}>
          {bands.map(b => <Cell key={b.band} fill={c} fillOpacity={0.35 + 0.65 * (b.value / max)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
