import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REASON_KEYS, MAX_REASON_LENGTH, isReasonKey, renderReason,
} from "../src/lib/live-coach/reasons.js";
import { evaluate, evaluateAll } from "../src/lib/live-coach/rules-engine.js";
import { estimateDamage, evaluateOmen, findCalibration, ASSESSMENT } from "../src/lib/live-coach/estimator.js";
import {
  initialStabilizer, updateStabilizer, suspendGate, STATE_STABILIZE_TICKS,
} from "../src/lib/live-coach/suspend.js";
import { buildAdvice } from "../src/lib/live-coach/advice.js";
import { STATE_QUALITY } from "../src/lib/battle/state-model.js";
import { fingerprintId } from "../src/lib/calibration/fingerprint.js";

// ---- reasons (US-11-06) ---------------------------------------------------

test("REASON_KEYS covers every §34.4 category the overlay might render", () => {
  const required = [
    "waiting-for-sync", "suspended-state-lost", "insufficient-data",
    "damage-cap-ok", "damage-cap-under",
    "omen-hitcount-clear", "omen-hitcount-marginal", "omen-hitcount-fail",
    "omen-dispel-required", "omen-cleanse-required",
    "charge-conserve", "skill-window", "raid-ended",
  ];
  for (const k of required) assert.ok(REASON_KEYS.has(k), `missing reasonKey ${k}`);
});

test("renderReason enforces the key catalog + max length (AC1/AC3)", () => {
  assert.throws(() => renderReason("free-form-reason"), /unknown reasonKey/);
  const out = renderReason("omen-hitcount-marginal", { required: 40, coverMin: 36, coverMax: 44 });
  assert.match(out, /Omen requires ≥ 40 hits/);
  assert.ok(out.length <= MAX_REASON_LENGTH);
});

test("isReasonKey rejects non-strings and unknown keys", () => {
  assert.equal(isReasonKey("waiting-for-sync"), true);
  assert.equal(isReasonKey("nope"), false);
  assert.equal(isReasonKey(null), false);
  assert.equal(isReasonKey(42), false);
});

// ---- rules-engine (US-11-03) ----------------------------------------------

const trueRule = (id, priority, reasonKey = "damage-cap-ok") => ({
  id, priority,
  when: () => ({ match: true, evidence: [`${id}:matched`] }),
  produce: () => ({ action: `act-${id}`, reasonKey, evidence: [`${id}:produced`], confidence: "Likely" }),
});
const falseRule = (id) => ({
  id, priority: "critical",
  when: () => false,
  produce: () => ({ action: "never", reasonKey: "damage-cap-ok" }),
});

test("evaluate returns null when nothing matches", () => {
  assert.equal(evaluate({}, [falseRule("a"), falseRule("b")]), null);
});

test("evaluate returns the highest-priority match (AC1) with §32 payload", () => {
  const out = evaluate({}, [
    trueRule("z", "normal"),
    trueRule("a", "critical"),
    falseRule("q"),
  ]);
  assert.equal(out.ruleId, "a");
  assert.equal(out.action, "act-a");
  assert.equal(out.priority, "critical");
  assert.ok(Array.isArray(out.evidence) && out.evidence.length >= 1);
  assert.ok(out.source);
});

test("evaluate breaks priority ties by rule id (AC2 deterministic)", () => {
  const out = evaluate({}, [trueRule("b", "high"), trueRule("a", "high")]);
  assert.equal(out.ruleId, "a");
});

test("evaluate demotes InsufficientData rules — never critical (AC3)", () => {
  const insuffRule = {
    id: "x", priority: "critical",
    when: () => true,
    produce: () => ({ action: "act", reasonKey: "insufficient-data", confidence: "InsufficientData" }),
  };
  const out = evaluate({}, [insuffRule, trueRule("y", "normal")]);
  assert.equal(out.ruleId, "y");
  assert.equal(out.priority, "normal");
});

test("evaluate refuses rules with unknown reasonKey (US-11-06 defence-in-depth)", () => {
  const badRule = {
    id: "bad", priority: "critical",
    when: () => true,
    produce: () => ({ action: "act", reasonKey: "totally-made-up", confidence: "Likely" }),
  };
  assert.equal(evaluate({}, [badRule]), null);
});

test("evaluate survives a rule that throws — never crashes the engine", () => {
  const boom = {
    id: "boom", priority: "critical",
    when: () => { throw new Error("bad rule"); },
    produce: () => ({ action: "x", reasonKey: "damage-cap-ok" }),
  };
  const out = evaluate({}, [boom, trueRule("ok", "high")]);
  assert.equal(out.ruleId, "ok");
});

test("evaluateAll returns full sorted match list (used by top-N UI)", () => {
  const rules = [trueRule("z", "normal"), trueRule("a", "critical"), trueRule("m", "high")];
  const all = evaluateAll({}, rules);
  assert.deepEqual(all.map((x) => x.ruleId), ["a", "m", "z"]);
});

// AC4 positive + negative fixture pair
test("AC4: rule has at least one positive fixture", () => {
  const r = trueRule("fx", "normal");
  assert.ok(evaluate({}, [r]) != null);
});
test("AC4: rule has at least one negative fixture", () => {
  const r = falseRule("fx");
  assert.equal(evaluate({}, [r]), null);
});

// ---- estimator (US-11-04) -------------------------------------------------

const fp = { party: ["a"], gameDataVersion: "1.0.0" };
const completedCal = {
  id: "cal:x",
  status: "completed",
  fingerprintFields: fp,
  fingerprintId: fingerprintId(fp),
  aggregate: {
    metric: "damage",
    min: 900_000, max: 1_150_000,
    p25: 950_000, p75: 1_050_000,
    median: 1_000_000,
    confidence: "HighConfidence",
  },
  calibrationVersion: 1,
};

test("estimateDamage returns InsufficientData with no calibration (AC3)", () => {
  const out = estimateDamage({ fingerprintFields: fp, calibrations: [] });
  assert.equal(out.assessment, ASSESSMENT.INSUFFICIENT_DATA);
  assert.equal(out.min, null);
  assert.equal(out.max, null);
});

test("estimateDamage uses P25/P75 bounds + assessment from calibration (AC1/AC2)", () => {
  const out = estimateDamage({ fingerprintFields: fp, calibrations: [completedCal] });
  assert.equal(out.min, 950_000);
  assert.equal(out.max, 1_050_000);
  assert.equal(out.assessment, ASSESSMENT.LIKELY);
  assert.equal(out.source.calibrationId, "cal:x");
});

test("estimateDamage ignores calibrations for a different fingerprint", () => {
  const other = { ...completedCal, id: "cal:y", fingerprintFields: { party: ["b"] }, fingerprintId: fingerprintId({ party: ["b"] }) };
  const out = estimateDamage({ fingerprintFields: fp, calibrations: [other] });
  assert.equal(out.assessment, ASSESSMENT.INSUFFICIENT_DATA);
});

test("evaluateOmen 'yes' when the low end clears the threshold (AC4)", () => {
  const range = { min: 45, max: 55, assessment: ASSESSMENT.LIKELY };
  const res = evaluateOmen({ range, threshold: 40, direction: "atLeast" });
  assert.equal(res.clears, "yes");
});

test("evaluateOmen 'marginal' when only the high end clears (AC4)", () => {
  const range = { min: 38, max: 44, assessment: ASSESSMENT.LIKELY };
  const res = evaluateOmen({ range, threshold: 40, direction: "atLeast" });
  assert.equal(res.clears, "marginal");
});

test("evaluateOmen 'no' when neither end clears", () => {
  const range = { min: 20, max: 30, assessment: ASSESSMENT.LIKELY };
  const res = evaluateOmen({ range, threshold: 40, direction: "atLeast" });
  assert.equal(res.clears, "no");
});

test("evaluateOmen falls back to InsufficientData on missing range", () => {
  assert.equal(evaluateOmen({ range: null, threshold: 40 }).assessment, ASSESSMENT.INSUFFICIENT_DATA);
});

test("findCalibration returns null for stale / invalidated / mismatched fingerprint", () => {
  const stale = { ...completedCal, status: "stale-fingerprint" };
  assert.equal(findCalibration([stale], { fingerprintFields: fp }), null);
  const invalid = { ...completedCal, status: "invalidated-pack" };
  assert.equal(findCalibration([invalid], { fingerprintFields: fp }), null);
  assert.equal(findCalibration([completedCal], { fingerprintFields: { party: ["different"] } }), null);
});

// ---- suspend (US-11-05) ---------------------------------------------------

test("STATE_STABILIZE_TICKS is 3 (documented default)", () => {
  assert.equal(STATE_STABILIZE_TICKS, 3);
});

test("stabilizer resumes after N consecutive Synchronized ticks (AC3)", () => {
  let s = initialStabilizer();
  s = updateStabilizer(s, STATE_QUALITY.SYNCHRONIZED);
  assert.equal(s.resumed, false);
  s = updateStabilizer(s, STATE_QUALITY.SYNCHRONIZED);
  assert.equal(s.resumed, false);
  s = updateStabilizer(s, STATE_QUALITY.SYNCHRONIZED);
  assert.equal(s.resumed, true);
});

test("stabilizer resets on any non-Synchronized tick (AC3 no drift-through)", () => {
  let s = initialStabilizer();
  s = updateStabilizer(s, STATE_QUALITY.SYNCHRONIZED);
  s = updateStabilizer(s, STATE_QUALITY.SYNCHRONIZED);
  s = updateStabilizer(s, STATE_QUALITY.STALE);
  assert.equal(s.consecutiveSync, 0);
  assert.equal(s.resumed, false);
});

test("suspendGate flags non-Synchronized quality (AC1/AC2)", () => {
  const stabilizer = { consecutiveSync: 5, resumed: true };
  const g = suspendGate(STATE_QUALITY.STALE, stabilizer);
  assert.equal(g.suspended, true);
  assert.equal(g.quality, STATE_QUALITY.STALE);
});

test("suspendGate stays suspended until the stabilizer has resumed", () => {
  const g = suspendGate(STATE_QUALITY.SYNCHRONIZED, { consecutiveSync: 1, resumed: false });
  assert.equal(g.suspended, true);
  assert.equal(g.reason, "stabilizing");
});

test("suspendGate clears once stabilizer is resumed on Synchronized state", () => {
  const g = suspendGate(STATE_QUALITY.SYNCHRONIZED, { consecutiveSync: 3, resumed: true });
  assert.equal(g.suspended, false);
});

// ---- advice pipeline (US-11-06 integration) --------------------------------

test("buildAdvice returns a suspended overlay payload when state is bad (AC6)", () => {
  const a = buildAdvice({
    rulesOutput: null,
    quality: STATE_QUALITY.STALE,
    stabilizer: initialStabilizer(),
  });
  assert.equal(a.suspended, true);
  assert.equal(a.synchronization, STATE_QUALITY.STALE);
  assert.equal(a.action, null);
  assert.match(a.reason, /Guidance suspended/);
});

test("buildAdvice returns Insufficient data payload when no rule matched", () => {
  const stab = { consecutiveSync: 5, resumed: true };
  const a = buildAdvice({ rulesOutput: null, quality: STATE_QUALITY.SYNCHRONIZED, stabilizer: stab });
  assert.equal(a.suspended, false);
  assert.equal(a.action, null);
  assert.equal(a.confidence, "InsufficientData");
});

test("buildAdvice renders reason via the catalog only — never free-form", () => {
  const rulesOutput = {
    ruleId: "r1", priority: "high", action: "hold-charge",
    reasonKey: "charge-conserve", reasonParams: { turnsUntilBurst: 2 },
    confidence: "Likely",
  };
  const a = buildAdvice({
    rulesOutput,
    quality: STATE_QUALITY.SYNCHRONIZED,
    stabilizer: { consecutiveSync: 5, resumed: true },
  });
  assert.equal(a.action, "hold-charge");
  assert.match(a.reason, /Hold charge/);
  assert.equal(a.confidence, "Likely");
  assert.equal(a._audit.ruleId, "r1");
});

test("buildAdvice throws if a rule slipped through with an unknown reasonKey (US-11-06 last line of defence)", () => {
  const bad = { ruleId: "b", priority: "high", action: "x", reasonKey: "bogus", confidence: "Likely" };
  assert.throws(() =>
    buildAdvice({
      rulesOutput: bad, quality: STATE_QUALITY.SYNCHRONIZED,
      stabilizer: { consecutiveSync: 5, resumed: true },
    }),
    /unknown reasonKey/,
  );
});
