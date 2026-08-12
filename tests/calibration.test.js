import { test } from "node:test";
import assert from "node:assert/strict";
import { PROTOCOLS, listProtocols, getProtocol } from "../src/lib/calibration/protocol.js";
import {
  FINGERPRINT_FIELDS, normalizeFingerprint, fingerprintId, fingerprintsEqual,
  diffFingerprint, invalidateOnPackBump, markStale, activeAggregate,
  CALIBRATION_STATUS,
} from "../src/lib/calibration/fingerprint.js";
import { buildSample, qualifies, flagOutliersMAD, median } from "../src/lib/calibration/sampling.js";
import { aggregate, CONFIDENCE } from "../src/lib/calibration/aggregate.js";
import { STATE_QUALITY } from "../src/lib/battle/state-model.js";

// ---------- Protocol library (US-08-01) ------------------------------------

test("protocol library covers all 14 §22.1 categories", () => {
  const expected = [
    "normal-attack", "multi-attack", "charge-attack", "full-chain",
    "skill-damage", "hit-counts", "buff-sequence", "healing",
    "charge-generation", "damage-cap", "dispel", "defense",
    "omen-coverage", "rotation-compare",
  ];
  const ids = PROTOCOLS.map((p) => p.id);
  for (const id of expected) assert.ok(ids.includes(id), `missing protocol ${id}`);
  assert.equal(PROTOCOLS.length, expected.length);
});

test("every protocol declares purpose, metric, minSamples, and steps (AC2)", () => {
  for (const p of listProtocols()) {
    assert.ok(p.purpose, `${p.id}: purpose missing`);
    assert.ok(p.metric, `${p.id}: metric missing`);
    assert.ok(Number.isInteger(p.minSamples) && p.minSamples > 0, `${p.id}: minSamples invalid`);
    assert.ok(Array.isArray(p.steps) && p.steps.length > 0, `${p.id}: steps missing`);
    for (const s of p.steps) assert.equal(typeof s, "string");
  }
});

test("getProtocol returns null for unknown ids (never fabricates, §7.8)", () => {
  assert.equal(getProtocol("nope"), null);
  assert.equal(getProtocol("charge-attack").id, "charge-attack");
});

// ---------- Fingerprint (US-08-05 / US-08-06) ------------------------------

const baseFp = {
  party: ["char.a", "char.b", "char.c", "char.d"],
  grid: ["wep.1", "wep.2"], summons: ["sum.1"], supportSummon: "sum.support",
  mainClass: "class.tank", classSkills: ["skill.1"],
  characterProgression: { "char.a": 5 }, weaponProgression: { "wep.1": 3 },
  summonProgression: { "sum.1": 4 }, raidBonus: null,
  gameDataVersion: "1.0.0",
};

test("normalizeFingerprint keeps declared fields in stable order", () => {
  const n = normalizeFingerprint(baseFp);
  assert.deepEqual(Object.keys(n), [...FINGERPRINT_FIELDS]);
});

test("fingerprintId is stable across key insertion order", () => {
  const shuffled = { gameDataVersion: "1.0.0", party: baseFp.party, grid: baseFp.grid };
  const a = fingerprintId(baseFp);
  const b = fingerprintId({ ...shuffled, ...baseFp });
  assert.equal(a, b);
});

test("fingerprintsEqual detects any tracked field change (AC1 — no merging)", () => {
  const changed = { ...baseFp, mainClass: "class.dps" };
  assert.equal(fingerprintsEqual(baseFp, baseFp), true);
  assert.equal(fingerprintsEqual(baseFp, changed), false);
});

test("diffFingerprint lists the exact fields that moved (AC3)", () => {
  const changed = { ...baseFp, grid: ["wep.9"], raidBonus: "wind" };
  const d = diffFingerprint(baseFp, changed);
  assert.deepEqual(d.sort(), ["grid", "raidBonus"]);
});

test("invalidateOnPackBump marks stale calibrations, retains history (§35.1)", () => {
  const calibrations = [
    { id: "c1", status: CALIBRATION_STATUS.COMPLETED, fingerprintFields: { gameDataVersion: "1.0.0" } },
    { id: "c2", status: CALIBRATION_STATUS.COMPLETED, fingerprintFields: { gameDataVersion: "2.0.0" } },
  ];
  const next = invalidateOnPackBump(calibrations, { newGameDataVersion: "2.0.0" });
  assert.equal(next[0].status, CALIBRATION_STATUS.INVALIDATED);
  assert.equal(next[0].invalidatedBy, "gameData-bump");
  assert.equal(next[1].status, CALIBRATION_STATUS.COMPLETED); // matches -> untouched
  assert.equal(next.length, 2, "no calibration deleted");
});

test("markStale records which fingerprint fields changed (AC2)", () => {
  const stale = markStale({ id: "c1", status: CALIBRATION_STATUS.COMPLETED }, ["grid"]);
  assert.equal(stale.status, CALIBRATION_STATUS.STALE);
  assert.deepEqual(stale.staleFields, ["grid"]);
});

test("activeAggregate refuses invalidated/stale — returns null (AC3, §33)", () => {
  const completed = { status: CALIBRATION_STATUS.COMPLETED, aggregate: { median: 100 } };
  const invalid = { status: CALIBRATION_STATUS.INVALIDATED, aggregate: { median: 100 } };
  const stale = { status: CALIBRATION_STATUS.STALE, aggregate: { median: 100 } };
  assert.deepEqual(activeAggregate(completed), { median: 100 });
  assert.equal(activeAggregate(invalid), null);
  assert.equal(activeAggregate(stale), null);
  assert.equal(activeAggregate(null), null);
});

// ---------- Sampling (US-08-03) --------------------------------------------

test("buildSample requires a finite numeric value", () => {
  assert.throws(() => buildSample({ protocolStepId: "s1", value: "abc" }), /finite number/);
  assert.throws(() => buildSample({ value: 10 }), /protocolStepId/);
  const s = buildSample({ protocolStepId: "s1", value: 42 });
  assert.equal(s.value, 42);
  assert.equal(s.outlier, false);
});

test("qualifies gate excludes state quality < Synchronized (AC3)", () => {
  const good = buildSample({ protocolStepId: "s1", value: 1, stateQuality: STATE_QUALITY.SYNCHRONIZED });
  const partial = buildSample({ protocolStepId: "s1", value: 1, stateQuality: STATE_QUALITY.PARTIALLY_SYNCHRONIZED });
  const stale = buildSample({ protocolStepId: "s1", value: 1, stateQuality: STATE_QUALITY.STALE });
  assert.equal(qualifies(good), true);
  assert.equal(qualifies(partial), false);
  assert.equal(qualifies(stale), false);
});

test("flagOutliersMAD marks tails, preserves samples (§7.8 no delete)", () => {
  const vals = [100, 101, 99, 102, 98, 100, 101, 99, 100, 500]; // 500 is the outlier
  const samples = vals.map((v, i) => buildSample({
    protocolStepId: `s${i}`, value: v, stateQuality: STATE_QUALITY.SYNCHRONIZED,
  }));
  const flagged = flagOutliersMAD(samples);
  assert.equal(flagged.length, samples.length);
  const outliers = flagged.filter((s) => s.outlier);
  assert.equal(outliers.length, 1);
  assert.equal(outliers[0].value, 500);
});

test("flagOutliersMAD is a no-op for tiny or identical samples", () => {
  const small = [1, 2].map((v, i) => buildSample({ protocolStepId: `s${i}`, value: v, stateQuality: STATE_QUALITY.SYNCHRONIZED }));
  assert.deepEqual(flagOutliersMAD(small).map((s) => s.outlier), [false, false]);
  const flat = Array.from({ length: 5 }, (_, i) => buildSample({ protocolStepId: `s${i}`, value: 42, stateQuality: STATE_QUALITY.SYNCHRONIZED }));
  assert.deepEqual(flagOutliersMAD(flat).map((s) => s.outlier), [false, false, false, false, false]);
});

test("median helper works on even and odd lengths", () => {
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), 0);
});

// ---------- Aggregate (US-08-04) -------------------------------------------

const protoNormal = getProtocol("normal-attack"); // minSamples: 10

function synchronizedSamples(values) {
  return values.map((v, i) => buildSample({
    protocolStepId: `s${i}`, value: v, stateQuality: STATE_QUALITY.SYNCHRONIZED,
  }));
}

test("aggregate returns all §22.2 fields for a completed test", () => {
  const samples = synchronizedSamples([100, 101, 102, 99, 100, 100, 101, 99, 102, 100]);
  const out = aggregate(samples, { protocol: protoNormal });
  for (const k of ["min", "max", "mean", "median", "p25", "p75", "variance", "sampleCount", "confidence", "outliers", "protocolCompatible", "recommendation"]) {
    assert.ok(k in out, `field ${k} missing`);
  }
  assert.equal(out.metric, "damage");
  assert.equal(out.protocolCompatible, true);
});

test("aggregate returns InsufficientData when below minSamples (AC2, §33)", () => {
  const samples = synchronizedSamples([100, 101, 99]);
  const out = aggregate(samples, { protocol: protoNormal });
  assert.equal(out.confidence, CONFIDENCE.INSUFFICIENT_DATA);
  assert.equal(out.protocolCompatible, false);
  assert.match(out.recommendation, /Run \d+ more sample/);
});

test("aggregate never counts unqualified samples toward primary aggregate (AC3)", () => {
  const good = synchronizedSamples([100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
  const partial = buildSample({ protocolStepId: "sX", value: 99999, stateQuality: STATE_QUALITY.PARTIALLY_SYNCHRONIZED });
  const out = aggregate([...good, partial], { protocol: protoNormal });
  assert.equal(out.qualifiedCount, 10);
  assert.equal(out.max, 100); // 99999 excluded
});

test("aggregate preserves outliers in the record but excludes them from primary", () => {
  const samples = synchronizedSamples([100, 101, 99, 102, 98, 100, 101, 99, 100, 100, 100, 5000]);
  const out = aggregate(samples, { protocol: protoNormal });
  assert.ok(out.outlierCount >= 1, "outlier not flagged");
  assert.ok(out.max < 5000, "outlier leaked into primary max");
  assert.ok(out.withOutliers.max >= 5000, "shadow aggregate should include outliers");
});

test("aggregate promotes to HighConfidence / Confirmed with tight spread + enough samples", () => {
  const tight = synchronizedSamples(Array.from({ length: 20 }, () => 100));
  const out = aggregate(tight, { protocol: protoNormal });
  assert.ok([CONFIDENCE.HIGH_CONFIDENCE, CONFIDENCE.CONFIRMED].includes(out.confidence),
    `expected HighConfidence or Confirmed, got ${out.confidence}`);
});

test("aggregate demotes to Uncertain on wide spread even with enough samples (§7.8)", () => {
  const wide = synchronizedSamples([50, 60, 70, 80, 90, 100, 120, 150, 180, 220]);
  const out = aggregate(wide, { protocol: protoNormal });
  assert.equal(out.confidence, CONFIDENCE.UNCERTAIN);
});
