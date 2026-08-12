// Prediction vs observation diff (§29, §33). Compares E08 calibration
// ranges against a run's observed metrics. Real metrics land with §49
// Q2/Q6 event parsers; today only run.turns is observable.

export function diffPrediction(run, calibration) {
  const rows = [];
  if (!run || !calibration) return { rows, verdict: "InsufficientData", reason: "run or calibration missing" };

  if (Number.isFinite(run.turns) && Number.isFinite(calibration.expectedTurns)) {
    const min = Math.floor(calibration.expectedTurns * 0.75);
    const max = Math.ceil(calibration.expectedTurns * 1.25);
    const inRange = run.turns >= min && run.turns <= max;
    rows.push({
      metric: "turns",
      predictedRange: [min, max],
      observed: run.turns,
      inRange,
      assessment: inRange ? "Likely" : "Marginal",
    });
  }

  if (rows.length === 0) return { rows, verdict: "InsufficientData", reason: "no comparable metrics" };
  const worst = rows.some((r) => !r.inRange) ? "OutOfRange" : "InRange";
  return { rows, verdict: worst };
}
