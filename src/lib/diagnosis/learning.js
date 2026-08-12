// Strategy + Player learning aggregators (§25.2, §25.3). Both operate on
// a list of finalized run records. Real per-sequence and per-deviation
// aggregation lands with §49 Q2/Q6 event parsers — until then, the
// aggregators produce shape-honest empty results with "InsufficientData"
// confidence so downstream Epics don't accidentally read fabricated data.

const MIN_SAMPLES = 3;

export function aggregateStrategyLearning(runs) {
  if (!Array.isArray(runs)) return { sequences: [], confidence: "InsufficientData" };
  // Group by planId. Real "sequence reliability" needs parsed action
  // events; today we only report per-plan run counts.
  const byPlan = new Map();
  for (const r of runs) {
    const key = r?.finalState?.planId || r?.raidId || "unknown";
    if (!byPlan.has(key)) byPlan.set(key, []);
    byPlan.get(key).push(r);
  }
  const sequences = [...byPlan.entries()].map(([key, list]) => ({
    key,
    sampleCount: list.length,
    confidence: list.length < MIN_SAMPLES ? "InsufficientData" : "Marginal",
  }));
  return {
    sequences,
    confidence: runs.length < MIN_SAMPLES ? "InsufficientData" : "Marginal",
    reason: "detailed sequence reliability lands with §49 Q2/Q6 event parsers",
  };
}

export function aggregatePlayerLearning(runs) {
  if (!Array.isArray(runs)) return { deviations: [], confidence: "InsufficientData" };
  // Real deviation detection needs kind-tagged events; today every
  // event is "unknown". Return an empty deviation list rather than
  // fabricate "skill used too early" patterns.
  return {
    deviations: [],
    sampleCount: runs.length,
    confidence: "InsufficientData",
    reason: "player-pattern detection needs kind-tagged events (§49 Q2/Q6)",
  };
}
