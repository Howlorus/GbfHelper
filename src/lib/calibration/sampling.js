// US-08-03 sample collection + outlier flagging (PRD §22, §23, §31.1).
// Pure. Samples arrive from either manual entry (Lab UI) or — once §49 Q2
// event parsers land — from E09's battle event stream.
//
// Outliers: Median Absolute Deviation (MAD). §7.8 says never delete — flag
// only; aggregate emits both "with" and "without" so the player can see.

import { STATE_QUALITY } from "../battle/state-model.js";

// Only Synchronized samples enter the primary aggregate (US-08-03 AC3).
const PRIMARY_QUALITY = new Set([STATE_QUALITY.SYNCHRONIZED]);

export function buildSample({
  protocolStepId, value, stateQuality = STATE_QUALITY.PARTIALLY_SYNCHRONIZED,
  ts = Date.now(), notes = null,
}) {
  if (protocolStepId == null) throw new TypeError("protocolStepId required");
  const n = Number(value);
  if (!Number.isFinite(n)) throw new TypeError("value must be a finite number");
  return { protocolStepId, value: n, stateQuality, ts, notes, outlier: false };
}

// AC3: samples with state quality < Synchronized are flagged and excluded
// from primary aggregates.
export function qualifies(sample) {
  return !!sample && PRIMARY_QUALITY.has(sample.stateQuality);
}

// MAD-based outlier detection. k=3.5 covers the classic Miller threshold
// (~99.7% of a normal). Zero MAD (all samples identical) → nothing is an
// outlier. Constant 1.4826 rescales MAD to a stdev estimator on normal data.
// ponytail: MAD, not stdev — one clean number to reason about, robust to
// the tail-heavy distributions calibration samples actually produce.
export function flagOutliersMAD(samples, { k = 3.5 } = {}) {
  if (!Array.isArray(samples) || samples.length < 3) {
    return (samples || []).map((s) => ({ ...s, outlier: false }));
  }
  const values = samples.map((s) => s.value).sort((a, b) => a - b);
  const med = median(values);
  const deviations = values.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  const mad = median(deviations) || 0;
  if (mad === 0) return samples.map((s) => ({ ...s, outlier: false }));
  const scale = 1.4826 * mad;
  return samples.map((s) => ({
    ...s,
    outlier: Math.abs(s.value - med) / scale > k,
  }));
}

export function median(sortedAsc) {
  if (!sortedAsc.length) return 0;
  const n = sortedAsc.length;
  const mid = Math.floor(n / 2);
  return n % 2 ? sortedAsc[mid] : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
}
