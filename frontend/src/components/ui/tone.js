// A "tone" is either a theme token name (primary, secondary, success, warning, danger, muted)
// or any CSS colour (e.g. a severity hex). Returns a CSS colour string.
const TOKENS = ["primary", "secondary", "success", "warning", "danger", "muted", "fg"];

export function toneColor(tone = "primary") {
  return TOKENS.includes(tone) ? `rgb(var(--c-${tone}))` : tone;
}

/** Same colour at a given opacity (works for tokens and #RRGGBB). */
export function toneAlpha(tone = "primary", alpha = 0.15) {
  if (TOKENS.includes(tone)) return `rgb(var(--c-${tone}) / ${alpha})`;
  if (/^#[0-9a-f]{6}$/i.test(tone)) {
    const a = Math.round(alpha * 255).toString(16).padStart(2, "0");
    return `${tone}${a}`;
  }
  return tone;
}
