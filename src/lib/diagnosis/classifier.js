// Run diagnosis classifier (§27). Given a finalized run record (from E09),
// return exactly one primary §27 category with evidence, confidence
// assessment, explanation, and a suggested next action. Never fabricates.

export const CATEGORY = Object.freeze({
  SETUP_FAILURE: "SetupFailure",
  ROTATION_FAILURE: "RotationFailure",
  EXECUTION_FAILURE: "ExecutionFailure",
  PREDICTION_FAILURE: "PredictionFailure",
  OBSERVATION_FAILURE: "ObservationFailure",
  VARIANCE_ISSUE: "VarianceIssue",
});

// State quality classes that force Observation failure (§7.5, §31.1).
const UNRELIABLE_QUALITIES = new Set(["Stale", "Conflicting", "Lost"]);

export function classifyRun(run, { plan = null, calibration = null } = {}) {
  if (!run || typeof run !== "object") {
    return { category: CATEGORY.OBSERVATION_FAILURE, confidence: "Insufficient", evidence: [], explanation: "no run provided", suggestedAction: "capture a run before requesting a diagnosis" };
  }

  // AC2: state-quality Lost/Stale/Conflicting on the final state ->
  // Observation failure trumps everything else.
  if (UNRELIABLE_QUALITIES.has(run.finalStateQuality)) {
    return {
      category: CATEGORY.OBSERVATION_FAILURE,
      confidence: "Confirmed",
      evidence: [`final state quality: ${run.finalStateQuality}`],
      explanation: "capture desynchronized mid-run; the diagnosis cannot rely on the event log",
      suggestedAction: "re-run the encounter with DevTools already open before entering the raid",
    };
  }

  // No events at all -> also Observation failure (adapter never attached).
  if (!Array.isArray(run.events) || run.events.length === 0) {
    return {
      category: CATEGORY.OBSERVATION_FAILURE,
      confidence: "Confirmed",
      evidence: ["events: []"],
      explanation: "no events observed during the session",
      suggestedAction: "open DevTools on the GBF tab BEFORE starting the raid so the capture adapter can attach",
    };
  }

  // Setup failure: plan available AND the run's tabTitle matches, but no
  // real event sequence produced. Pinpoint diagnosis needs domain-parsed
  // events (§49 Q2/Q6 feasibility) — until then we degrade cleanly.
  if (calibration && Number.isFinite(calibration.expectedTurns) && Number.isFinite(run.turns) && run.turns > calibration.expectedTurns * 1.5) {
    return {
      category: CATEGORY.PREDICTION_FAILURE,
      confidence: "Likely",
      evidence: [`run.turns=${run.turns}, calibration.expectedTurns=${calibration.expectedTurns}`],
      explanation: "the encounter took much longer than the calibrated estimate",
      suggestedAction: "re-run calibration for the current setup, or adjust the rotation",
    };
  }

  // Fallback while real event kinds aren't parsed: mark as Variance so we
  // don't blame setup / rotation / execution without evidence.
  return {
    category: CATEGORY.VARIANCE_ISSUE,
    confidence: "InsufficientData",
    evidence: [`events observed: ${run.events.length}`, `turns: ${run.turns ?? "?"}`],
    explanation: "event stream is present but real event parsers are not yet pinned; cannot classify further",
    suggestedAction: "ship §49 Q2/Q6 feasibility parsers before drawing firmer conclusions",
  };
}
