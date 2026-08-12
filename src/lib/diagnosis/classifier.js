// Run diagnosis classifier (§27). classifyRun(run) returns the §27
// payload contract: { category, confidence, evidence, explanation,
// suggestedAction }. Never fabricates a Setup/Rotation/Execution
// verdict until §49 Q2/Q6 event parsers land — until then the honest
// verdicts are Observation (bad capture) or Variance (event stream is
// present but not classifiable yet).

export const CATEGORY = Object.freeze({
  OBSERVATION_FAILURE: "ObservationFailure",
  VARIANCE_ISSUE: "VarianceIssue",
});

export function classifyRun(run) {
  if (!run || typeof run !== "object") {
    return {
      category: CATEGORY.OBSERVATION_FAILURE,
      confidence: "Insufficient",
      evidence: [],
      explanation: "no run provided",
      suggestedAction: "capture a run before requesting a diagnosis",
    };
  }
  const q = run.finalStateQuality;
  if (q === "Stale" || q === "Conflicting" || q === "Lost") {
    return {
      category: CATEGORY.OBSERVATION_FAILURE,
      confidence: "Confirmed",
      evidence: [`final state quality: ${q}`],
      explanation: "capture desynchronized mid-run; the diagnosis cannot rely on the event log",
      suggestedAction: "re-run the encounter with DevTools already open before entering the raid",
    };
  }
  if (!Array.isArray(run.events) || run.events.length === 0) {
    return {
      category: CATEGORY.OBSERVATION_FAILURE,
      confidence: "Confirmed",
      evidence: ["events: []"],
      explanation: "no events observed during the session",
      suggestedAction: "open DevTools on the GBF tab BEFORE starting the raid so the capture adapter can attach",
    };
  }
  return {
    category: CATEGORY.VARIANCE_ISSUE,
    confidence: "InsufficientData",
    evidence: [`events observed: ${run.events.length}`, `turns: ${run.turns ?? "?"}`],
    explanation: "event stream is present but real event parsers are not yet pinned; cannot classify further",
    suggestedAction: "ship §49 Q2/Q6 feasibility parsers before drawing firmer conclusions",
  };
}
