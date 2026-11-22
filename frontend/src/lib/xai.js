// Small, transparent helpers on top of the /explain response. Nothing is estimated:
// every number is a ratio or a sort of values the API returned.

/** Scale an array so its maximum is 1 (for overlaying curves with different units). */
export function normalize(arr = []) {
  const max = Math.max(...arr.map(v => Math.abs(v)), 0);
  return max > 0 ? arr.map(v => Math.abs(v) / max) : arr.map(() => 0);
}

/** Top-N bands with their share of the total |SHAP| over all bands. */
export function topBandsWithShare(res, n = 10) {
  const total = (res.shap_bands || []).reduce((s, b) => s + b.importance, 0) || 1;
  return (res.top10_bands || []).slice(0, n).map((b, i) => ({ ...b, rank: i + 1, share: b.importance / total }));
}

/** Share of total importance carried by the top-k bands. */
export function topShare(res, k = 3) {
  return topBandsWithShare(res, k).reduce((s, b) => s + b.share, 0);
}

/** { P1: 0.52, P2: 0.48 } shares of channel importance. */
export function channelShares(ci = {}) {
  const total = Object.values(ci).reduce((s, v) => s + v, 0) || 1;
  return Object.fromEntries(Object.entries(ci).map(([k, v]) => [k, v / total]));
}

/** Frequency span (Hz) covered by a list of bands {lo, hi}. */
export function bandSpan(bands = []) {
  if (!bands.length) return null;
  return { lo: Math.min(...bands.map(b => b.lo)), hi: Math.max(...bands.map(b => b.hi)) };
}

/** "100-150Hz" -> { lo: 100, hi: 150 } (bands from the global SHAP files carry only a name). */
export function parseBand(name) {
  const m = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)Hz$/.exec(String(name));
  return m ? { lo: Number(m[1]), hi: Number(m[2]) } : null;
}

/** Fraction of `narrow` bands (with lo/hi) whose range lies inside one of the `wide` bands (by name). */
export function fractionInside(narrow = [], wide = []) {
  const ranges = wide.map(w => parseBand(w.band)).filter(Boolean);
  if (!narrow.length || !ranges.length) return null;
  return narrow.filter(b => ranges.some(r => b.lo >= r.lo && b.hi <= r.hi)).length / narrow.length;
}

/** Overlap of two band lists (by name), as a fraction of the shorter list. */
export function bandOverlap(a = [], b = []) {
  if (!a.length || !b.length) return null;
  const sb = new Set(b.map(x => x.band));
  return a.filter(x => sb.has(x.band)).length / Math.min(a.length, b.length);
}
