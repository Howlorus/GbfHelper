import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyRun, CATEGORY } from "../src/lib/diagnosis/classifier.js";

function runWith(overrides = {}) {
  return {
    id: "run:1", sessionId: "s-1", startedAt: 0, endedAt: 1000,
    endReason: "user-stop", finalStateQuality: "Synchronized",
    turns: 10, events: [{ ts: 100, kind: "unknown" }], finalState: null,
    ...overrides,
  };
}

test("no run -> ObservationFailure with InsufficientData", () => {
  const d = classifyRun(null);
  assert.equal(d.category, CATEGORY.OBSERVATION_FAILURE);
  assert.equal(d.confidence, "Insufficient");
});

test("final state Lost/Stale/Conflicting -> ObservationFailure (§27.5)", () => {
  for (const q of ["Lost", "Stale", "Conflicting"]) {
    const d = classifyRun(runWith({ finalStateQuality: q }));
    assert.equal(d.category, CATEGORY.OBSERVATION_FAILURE);
    assert.equal(d.confidence, "Confirmed");
    assert.match(d.evidence[0], new RegExp(q));
  }
});

test("empty event log -> ObservationFailure with 'open DevTools' hint", () => {
  const d = classifyRun(runWith({ events: [] }));
  assert.equal(d.category, CATEGORY.OBSERVATION_FAILURE);
  assert.match(d.suggestedAction, /DevTools/);
});

test("Synchronized run with events but no calibration -> VarianceIssue / InsufficientData", () => {
  const d = classifyRun(runWith());
  assert.equal(d.category, CATEGORY.VARIANCE_ISSUE);
  assert.equal(d.confidence, "InsufficientData");
  assert.match(d.explanation, /parsers are not yet pinned/);
});

test("Every diagnosis carries evidence + suggestedAction (§27 payload contract)", () => {
  const cases = [
    classifyRun(null),
    classifyRun(runWith({ finalStateQuality: "Lost" })),
    classifyRun(runWith({ events: [] })),
    classifyRun(runWith()),
  ];
  for (const d of cases) {
    assert.ok(Array.isArray(d.evidence), "evidence must be an array");
    assert.ok(typeof d.explanation === "string" && d.explanation.length > 0);
    assert.ok(typeof d.suggestedAction === "string" && d.suggestedAction.length > 0);
  }
});
