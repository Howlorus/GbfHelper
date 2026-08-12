// US-11-04 damage & omen estimator (PRD §33). Pure. Never emits a probability.
// Always returns a range + one §33 assessment label.
//
// §7.8: no fabricated point estimates. If no calibration matches the current
// fingerprint, assessment is "InsufficientData" and min/max are null.

import { fingerprintId } from "../calibration/fingerprint.js";

export const ASSESSMENT = Object.freeze({
  CONFIRMED: "Confirmed",
  LIKELY: "Likely",
  MARGINAL: "Marginal",
  UNLIKELY: "Unlikely",
  IMPOSSIBLE: "Impossible",
  INSUFFICIENT_DATA: "InsufficientData",
});

// Map calibration confidence → estimator assessment for a in-fingerprint value.
// Calibration confidences: Confirmed / HighConfidence / Uncertain / InsufficientData.
function assessmentFromCalibrationConfidence(cconf) {
  switch (cconf) {
    case "Confirmed": return ASSESSMENT.CONFIRMED;
    case "HighConfidence": return ASSESSMENT.LIKELY;
    case "Uncertain": return ASSESSMENT.MARGINAL;
    default: return ASSESSMENT.INSUFFICIENT_DATA;
  }
}

// Pick the best matching calibration for a given fingerprint. Only completed,
// non-invalidated, non-stale ones qualify (activeAggregate does that job
// upstream — we accept whatever the caller passes).
export function findCalibration(calibrations, { fingerprintFields, metric }) {
  if (!Array.isArray(calibrations) || !fingerprintFields) return null;
  const targetFp = fingerprintId(fingerprintFields);
  for (const c of calibrations) {
    if (!c || c.status !== "completed") continue;
    if (c.fingerprintId !== targetFp && fingerprintId(c.fingerprintFields || {}) !== targetFp) continue;
    if (metric && c.aggregate?.metric && c.aggregate.metric !== metric) continue;
    return c;
  }
  return null;
}

// AC1/AC2/AC3: given a fingerprint + optional calibrations, estimate the
// damage range and pick an assessment. No calibration → InsufficientData.
export function estimateDamage({ fingerprintFields, metric = "damage", calibrations = [] }) {
  const match = findCalibration(calibrations, { fingerprintFields, metric });
  if (!match || !match.aggregate) {
    return {
      min: null, max: null,
      assessment: ASSESSMENT.INSUFFICIENT_DATA,
      source: null,
    };
  }
  const agg = match.aggregate;
  return {
    min: agg.p25 ?? agg.min ?? null,
    max: agg.p75 ?? agg.max ?? null,
    median: agg.median ?? null,
    assessment: assessmentFromCalibrationConfidence(agg.confidence),
    source: { calibrationId: match.id, calibrationVersion: match.calibrationVersion || 1 },
  };
}

// AC4: evaluate a threshold against a range and label clearance.
// No probability; strictly range-vs-threshold reasoning.
export function evaluateOmen({ range, threshold, direction = "atLeast" }) {
  if (!range || range.min == null || range.max == null || !Number.isFinite(threshold)) {
    return { clears: "unknown", assessment: ASSESSMENT.INSUFFICIENT_DATA };
  }
  const { min, max } = range;
  const passesLow = direction === "atLeast" ? min >= threshold : max <= threshold;
  const passesHigh = direction === "atLeast" ? max >= threshold : min <= threshold;
  if (passesLow) return { clears: "yes", assessment: promote(range.assessment, ASSESSMENT.LIKELY) };
  if (passesHigh) return { clears: "marginal", assessment: ASSESSMENT.MARGINAL };
  return { clears: "no", assessment: ASSESSMENT.UNLIKELY };
}

// If the range assessment is Confirmed, "yes" clearance stays Confirmed.
// Otherwise a "yes" clearance is at most Likely — one measurement doesn't
// prove a threshold clears every time.
function promote(rangeAssessment, floor) {
  if (rangeAssessment === ASSESSMENT.CONFIRMED) return ASSESSMENT.CONFIRMED;
  return floor;
}
