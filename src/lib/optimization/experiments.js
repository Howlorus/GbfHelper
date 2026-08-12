// US-14-02 Local A/B experiments (PRD §30). Pure.
//
// Compare two variants across per-metric medians (with MAD-based spread).
// Never emits "A wins with 87%" — every metric conclusion is a §33
// assessment label. Ranking uses signed weights from US-14-03 but is only
// surfaced with an assessment; no aggregated percentage (§7.8 / AC4).
//
// Comparability guard: runs must share Setup Fingerprint within each variant
// group (AC1). Mixed fingerprints → "Insufficient data" for that variant.

import { median, flagOutliersMAD } from "../calibration/sampling.js";
import { signedWeights, defaultObjective, isObjective } from "./objectives.js";
import { fingerprintId } from "../calibration/fingerprint.js";

export const METRICS = Object.freeze([
  "medianDamage", "damageVariance", "hitReliability", "survival",
  "omenSuccess", "turns", "potionUsage", "knockouts", "complexity",
]);

// Minimum runs per variant before comparison is meaningful.
export const MIN_RUNS_PER_VARIANT = 5;

// AC2 threshold. Below this per variant → InsufficientData for that variant.
function fingerprintGroupsAgree(runs) {
  if (!runs.length) return { agree: true, fingerprintId: null };
  const first = runs[0].fingerprintId || (runs[0].fingerprintFields ? fingerprintId(runs[0].fingerprintFields) : null);
  for (const r of runs) {
    const fpid = r.fingerprintId || (r.fingerprintFields ? fingerprintId(r.fingerprintFields) : null);
    if (fpid !== first) return { agree: false, fingerprintId: null };
  }
  return { agree: true, fingerprintId: first };
}

function readMetric(run, metric) {
  const v = run?.metrics?.[metric];
  return Number.isFinite(v) ? v : null;
}

function metricSummary(runs, metric) {
  const vals = runs.map((r) => readMetric(r, metric)).filter((v) => v != null);
  if (!vals.length) return null;
  const sorted = vals.slice().sort((a, b) => a - b);
  const med = median(sorted);
  const flagged = flagOutliersMAD(vals.map((v) => ({ value: v, stateQuality: "Synchronized" })));
  const primary = flagged.filter((s) => !s.outlier).map((s) => s.value).sort((a, b) => a - b);
  const primMed = primary.length ? median(primary) : med;
  return {
    n: vals.length,
    primaryN: primary.length,
    outliers: flagged.filter((s) => s.outlier).length,
    median: primMed,
    min: primary[0] ?? sorted[0],
    max: primary[primary.length - 1] ?? sorted[sorted.length - 1],
  };
}

// §33 assessment for one metric's A-vs-B comparison. Ranges dominate; only
// when both sides are clearly separated do we speak up.
function assessMetric(a, b, signedWeight) {
  if (!a || !b || a.n < MIN_RUNS_PER_VARIANT || b.n < MIN_RUNS_PER_VARIANT) {
    return { winner: null, assessment: "InsufficientData" };
  }
  if (signedWeight === 0) {
    return { winner: null, assessment: "InsufficientData", note: "metric not in current objective" };
  }
  const better = signedWeight > 0 ? "higher" : "lower";
  const aWins = better === "higher" ? a.median > b.median : a.median < b.median;
  const winner = aWins ? "A" : "B";
  const loser = aWins ? b : a;
  const winnerSide = aWins ? a : b;
  const separated = better === "higher"
    ? winnerSide.min > loser.max
    : winnerSide.max < loser.min;
  const overlap = !separated;

  let assessment;
  if (separated) assessment = "Confirmed";
  else {
    const gap = Math.abs(a.median - b.median);
    const spread = Math.max(a.max - a.min, b.max - b.min) || 1;
    const ratio = gap / spread;
    if (ratio >= 0.5) assessment = "Likely";
    else if (ratio >= 0.2) assessment = "Marginal";
    else assessment = "InsufficientData";
  }

  return { winner, assessment, overlap };
}

// The main entry point.
export function compareVariants({ variantA, variantB, runsA = [], runsB = [], objectiveId } = {}) {
  const objective = isObjective(objectiveId) ? objectiveId : defaultObjective();
  const weights = signedWeights(objective);

  const gA = fingerprintGroupsAgree(runsA);
  const gB = fingerprintGroupsAgree(runsB);

  const perMetric = {};
  for (const metric of METRICS) {
    const summA = gA.agree ? metricSummary(runsA, metric) : null;
    const summB = gB.agree ? metricSummary(runsB, metric) : null;
    const verdict = assessMetric(summA, summB, weights[metric] ?? 0);
    perMetric[metric] = {
      A: summA, B: summB,
      weight: weights[metric] ?? 0,
      ...verdict,
    };
  }

  // Overall §33 assessment: count metrics that "matter" (weight ≠ 0) and see
  // whether they lean one way — never emit a percentage or aggregated score.
  const relevant = METRICS.filter((m) => (weights[m] || 0) !== 0);
  const scores = { A: 0, B: 0, ties: 0, insufficient: 0 };
  for (const m of relevant) {
    const v = perMetric[m];
    if (v.assessment === "InsufficientData") { scores.insufficient++; continue; }
    if (!v.winner) { scores.ties++; continue; }
    scores[v.winner]++;
  }
  const overall = pickOverall(scores, relevant.length);

  return {
    objective,
    weights,
    variantA: variantA || null,
    variantB: variantB || null,
    fingerprintA: gA.fingerprintId, fingerprintB: gB.fingerprintId,
    fingerprintsAgree: { A: gA.agree, B: gB.agree },
    minRunsPerVariant: MIN_RUNS_PER_VARIANT,
    perMetric,
    overall,
  };
}

function pickOverall(scores, total) {
  if (total === 0 || scores.insufficient > total / 2) {
    return { winner: null, assessment: "InsufficientData" };
  }
  if (scores.A === 0 && scores.B === 0) return { winner: null, assessment: "InsufficientData" };
  if (scores.A > scores.B * 2) return { winner: "A", assessment: "Likely" };
  if (scores.B > scores.A * 2) return { winner: "B", assessment: "Likely" };
  if (scores.A > scores.B) return { winner: "A", assessment: "Marginal" };
  if (scores.B > scores.A) return { winner: "B", assessment: "Marginal" };
  return { winner: null, assessment: "InsufficientData" };
}

// AC3: exportable report. Ponytail: JSON, one call — the UI writes the blob.
export function exportComparisonReport(comparison, { extensionVersion = "0.0.0", now = Date.now() } = {}) {
  return {
    kind: "gbf-copilot/ab-comparison",
    schemaVersion: 1,
    extensionVersion,
    exportedAt: now,
    comparison,
  };
}
