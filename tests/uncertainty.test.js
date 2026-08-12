import { test } from "node:test";
import assert from "node:assert/strict";
import { ASSESSMENT, isAssessment, worseOf, formatRange, formatAssessment } from "../src/lib/uncertainty.js";

test("ASSESSMENT covers §33 levels exactly", () => {
  for (const level of ["Confirmed", "Likely", "Marginal", "Unlikely", "Impossible", "InsufficientData"]) {
    assert.ok(Object.values(ASSESSMENT).includes(level));
  }
});

test("isAssessment: accepts valid levels, rejects strings + numbers + null", () => {
  assert.equal(isAssessment(ASSESSMENT.LIKELY), true);
  assert.equal(isAssessment("high"), false);
  assert.equal(isAssessment(42), false);
  assert.equal(isAssessment(null), false);
});

test("worseOf picks the more pessimistic of two assessments", () => {
  assert.equal(worseOf(ASSESSMENT.CONFIRMED, ASSESSMENT.LIKELY), ASSESSMENT.LIKELY);
  assert.equal(worseOf(ASSESSMENT.LIKELY, ASSESSMENT.IMPOSSIBLE), ASSESSMENT.IMPOSSIBLE);
  assert.equal(worseOf(ASSESSMENT.INSUFFICIENT_DATA, ASSESSMENT.CONFIRMED), ASSESSMENT.INSUFFICIENT_DATA);
});

test("formatRange renders min-max, collapses when equal, returns em-dash for garbage", () => {
  assert.equal(formatRange(36, 44), "36–44");
  assert.equal(formatRange(40, 40), "40");
  assert.equal(formatRange(NaN, 5), "—");
});

test("formatAssessment attaches an optional range and refuses invalid assessments", () => {
  assert.equal(formatAssessment(ASSESSMENT.LIKELY, { min: 36, max: 44 }), "Likely (36–44)");
  assert.equal(formatAssessment(ASSESSMENT.CONFIRMED), "Confirmed");
  assert.equal(formatAssessment("total-lie", { min: 1, max: 2 }), "—");
});
