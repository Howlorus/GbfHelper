import { test } from "node:test";
import assert from "node:assert/strict";
import { diffPrediction } from "../src/lib/diagnosis/prediction-diff.js";
import { aggregateStrategyLearning, aggregatePlayerLearning } from "../src/lib/diagnosis/learning.js";

test("diffPrediction: no run or no calibration -> InsufficientData", () => {
  assert.equal(diffPrediction(null, null).verdict, "InsufficientData");
  assert.equal(diffPrediction({ turns: 5 }, null).verdict, "InsufficientData");
});

test("diffPrediction: turns inside [±25%] of expected -> InRange / Likely", () => {
  const d = diffPrediction({ turns: 10 }, { expectedTurns: 10 });
  assert.equal(d.verdict, "InRange");
  assert.equal(d.rows[0].assessment, "Likely");
});

test("diffPrediction: turns far outside expected -> OutOfRange / Marginal", () => {
  const d = diffPrediction({ turns: 30 }, { expectedTurns: 10 });
  assert.equal(d.verdict, "OutOfRange");
  assert.equal(d.rows[0].inRange, false);
});

test("aggregateStrategyLearning: fewer than MIN_SAMPLES -> InsufficientData at both levels", () => {
  const runs = [{ raidId: "bp" }, { raidId: "bp" }];
  const a = aggregateStrategyLearning(runs);
  assert.equal(a.confidence, "InsufficientData");
  assert.equal(a.sequences[0].confidence, "InsufficientData");
});

test("aggregateStrategyLearning groups by planId / raidId", () => {
  const runs = [
    { raidId: "bp", finalState: { planId: "plan-1" } },
    { raidId: "bp", finalState: { planId: "plan-1" } },
    { raidId: "belial", finalState: { planId: "plan-2" } },
  ];
  const a = aggregateStrategyLearning(runs);
  assert.equal(a.sequences.length, 2);
});

test("aggregatePlayerLearning: returns empty deviations + InsufficientData (no fabricated patterns)", () => {
  const a = aggregatePlayerLearning([{ id: 1 }, { id: 2 }, { id: 3 }]);
  assert.deepEqual(a.deviations, []);
  assert.equal(a.confidence, "InsufficientData");
  assert.match(a.reason, /kind-tagged events/);
});
