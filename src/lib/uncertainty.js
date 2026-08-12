// §33 assessment levels + formatting helpers. Every downstream module that
// would otherwise render a numeric probability must go through this module.

export const ASSESSMENT = Object.freeze({
  CONFIRMED: "Confirmed",
  LIKELY: "Likely",
  MARGINAL: "Marginal",
  UNLIKELY: "Unlikely",
  IMPOSSIBLE: "Impossible",
  INSUFFICIENT_DATA: "InsufficientData",
});

const RANK = { Confirmed: 0, Likely: 1, Marginal: 2, Unlikely: 3, Impossible: 4, InsufficientData: 5 };

export function isAssessment(v) {
  return typeof v === "string" && Object.values(ASSESSMENT).includes(v);
}

export function worseOf(a, b) {
  return (RANK[a] ?? -1) >= (RANK[b] ?? -1) ? a : b;
}

export function formatRange(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "—";
  if (min === max) return String(min);
  return `${min}–${max}`;
}

export function formatAssessment(assessment, range) {
  if (!isAssessment(assessment)) return "—";
  const r = range && Number.isFinite(range.min) && Number.isFinite(range.max)
    ? ` (${formatRange(range.min, range.max)})` : "";
  return `${assessment}${r}`;
}
