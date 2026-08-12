// US-08-04 aggregation outputs (PRD §22.2). Pure. Feeds the §33 confidence
// vocabulary — Insufficient / Uncertain / HighConfidence / Confirmed.
// §7.8: ranges + assessment, never fabricated point estimates.

import { flagOutliersMAD, qualifies, median as medianOf } from "./sampling.js";

export const CONFIDENCE = Object.freeze({
  INSUFFICIENT_DATA: "InsufficientData",
  UNCERTAIN: "Uncertain",
  HIGH_CONFIDENCE: "HighConfidence",
  CONFIRMED: "Confirmed",
});

// Percentile via nearest-rank on the sorted sample. Simple and stable.
function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(p * sortedAsc.length) - 1));
  return sortedAsc[idx];
}

function variance(values, mean) {
  if (values.length < 2) return 0;
  let s = 0;
  for (const v of values) s += (v - mean) * (v - mean);
  return s / (values.length - 1); // sample variance (Bessel)
}

// §33-ish: relative IQR (interquartile range / median) as a spread proxy.
// Tight spread + enough samples → HighConfidence.
// ponytail: 4 named buckets, no floating-point probability shown to the user.
function assessConfidence({ qualifiedCount, minSamples, relSpread }) {
  if (qualifiedCount < minSamples) return CONFIDENCE.INSUFFICIENT_DATA;
  if (!Number.isFinite(relSpread)) return CONFIDENCE.UNCERTAIN;
  if (relSpread <= 0.05 && qualifiedCount >= minSamples * 2) return CONFIDENCE.CONFIRMED;
  if (relSpread <= 0.15) return CONFIDENCE.HIGH_CONFIDENCE;
  if (relSpread <= 0.35) return CONFIDENCE.UNCERTAIN;
  return CONFIDENCE.UNCERTAIN;
}

// Take the raw sample stream and emit the full §22.2 output record.
// - `protocol` — from src/lib/calibration/protocol.js (for minSamples).
// - Uses only samples that pass state-quality gate (§31.1).
// - Flags outliers via MAD; both the primary aggregate (outliers excluded)
//   and a `withOutliers` shadow are returned. Never silently deletes.
export function aggregate(samples, { protocol }) {
  if (!Array.isArray(samples)) throw new TypeError("samples must be an array");
  if (!protocol) throw new TypeError("protocol required");

  const qualified = samples.filter(qualifies);
  const flagged = flagOutliersMAD(qualified);
  const outliers = flagged.filter((s) => s.outlier);
  const primary = flagged.filter((s) => !s.outlier);

  const stats = describe(primary.map((s) => s.value));
  const withOutliers = describe(flagged.map((s) => s.value));

  const relSpread = stats.median > 0 && Number.isFinite(stats.iqr)
    ? stats.iqr / stats.median : Infinity;
  const confidence = assessConfidence({
    qualifiedCount: primary.length,
    minSamples: protocol.minSamples,
    relSpread,
  });

  return {
    protocolId: protocol.id,
    metric: protocol.metric,
    sampleCount: samples.length,
    qualifiedCount: qualified.length,
    primaryCount: primary.length,
    outlierCount: outliers.length,
    ...stats,
    withOutliers,
    confidence,
    protocolCompatible: primary.length >= protocol.minSamples,
    recommendation: primary.length >= protocol.minSamples
      ? "sufficient"
      : `Run ${protocol.minSamples - primary.length} more sample(s) to reach protocol minimum.`,
    outliers,
  };
}

function describe(values) {
  const n = values.length;
  if (!n) {
    return { min: null, max: null, mean: null, median: null, p25: null, p75: null, iqr: null, variance: 0 };
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const p25 = percentile(sorted, 0.25);
  const p75 = percentile(sorted, 0.75);
  return {
    min: sorted[0],
    max: sorted[n - 1],
    mean,
    median: medianOf(sorted),
    p25, p75,
    iqr: (p25 != null && p75 != null) ? p75 - p25 : null,
    variance: variance(values, mean),
  };
}
