import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OBJECTIVES, DEFAULT_OBJECTIVE, isObjective, weightsFor, signedWeights, metricSign,
} from "../src/lib/optimization/objectives.js";
import { proposeChanges, DIMENSION } from "../src/lib/optimization/engine.js";
import { compareVariants, exportComparisonReport, METRICS, MIN_RUNS_PER_VARIANT } from "../src/lib/optimization/experiments.js";
import { applyProposal, buildAuditEntry, compareProposalAgainstPlan, DECISION } from "../src/lib/optimization/proposals.js";
import { fingerprintId } from "../src/lib/calibration/fingerprint.js";

// ---- objectives (US-14-03) ------------------------------------------------

test("DEFAULT_OBJECTIVE is 'first-clear' (AC2 safest default)", () => {
  assert.equal(DEFAULT_OBJECTIVE, "first-clear");
});

test("OBJECTIVES covers every §30 objective in the story", () => {
  for (const o of ["first-clear", "safe-solo", "fast-clear", "farming", "low-variance", "max-damage", "max-survival", "min-complexity"]) {
    assert.ok(OBJECTIVES.includes(o), `missing objective ${o}`);
  }
});

test("weightsFor returns visible weights per metric (AC1 auditable)", () => {
  const w = weightsFor("safe-solo");
  assert.ok(w.survival > 0);
  assert.ok(w.knockouts > 0);
});

test("weightsFor unknown id falls back to default without throwing", () => {
  assert.deepEqual(weightsFor("bogus"), weightsFor(DEFAULT_OBJECTIVE));
});

test("signedWeights encodes 'more is better' (+) and 'less is better' (-)", () => {
  const sw = signedWeights("first-clear");
  assert.ok(sw.survival > 0);
  assert.ok(sw.knockouts < 0);
  assert.equal(metricSign("medianDamage"), 1);
  assert.equal(metricSign("turns"), -1);
});

test("isObjective is a strict membership check", () => {
  assert.equal(isObjective("first-clear"), true);
  assert.equal(isObjective("nope"), false);
});

// ---- engine (US-14-01) ----------------------------------------------------

const plan = {
  planId: "plan.faa", raidPlanVersion: 3, raidId: "faa", element: "wind",
  objective: "first-clear", status: "current",
  party: ["c.a", "c.b", "c.c", "c.d"],
  grid: ["w.1", "w.2"],
};

test("engine returns [] for VarianceIssue diagnosis (AC2)", () => {
  const d = { category: "VarianceIssue", evidence: ["events:100"] };
  const out = proposeChanges({ diagnosis: d, plan, ruleInputs: [{ kind: "missing-capability", changedFields: [{ field: "party", from: "c.a", to: "c.x" }] }] });
  assert.deepEqual(out, []);
});

test("engine returns [] for ObservationFailure diagnosis (AC2)", () => {
  const d = { category: "ObservationFailure", evidence: [] };
  const out = proposeChanges({ diagnosis: d, plan, ruleInputs: [{ kind: "missing-capability", changedFields: [{ field: "party", from: "c.a", to: "c.x" }] }] });
  assert.deepEqual(out, []);
});

test("engine returns [] when there are no rule inputs (AC2)", () => {
  const d = { category: "SetupFailure", evidence: ["missing dispel"] };
  assert.deepEqual(proposeChanges({ diagnosis: d, plan, ruleInputs: [] }), []);
});

test("engine emits one proposal per matched rule input, dimension mapped (AC1)", () => {
  const d = { category: "SetupFailure", evidence: ["missing dispel"] };
  const out = proposeChanges({
    diagnosis: d, plan,
    ruleInputs: [
      { kind: "missing-dispel", id: "r1", changedFields: [{ field: "party", from: "c.d", to: "c.dispeller" }] },
      { kind: "mistimed-action", id: "r2", changedFields: [{ field: "rotation", from: null, to: ["skill.1", "skill.2"] }] },
    ],
  });
  assert.equal(out.length, 2);
  assert.equal(out[0].dimension, DIMENSION.CHARACTERS);
  assert.equal(out[1].dimension, DIMENSION.ROTATION);
});

test("engine ignores unknown rule-input kinds — never fabricates a dimension", () => {
  const d = { category: "SetupFailure", evidence: [] };
  const out = proposeChanges({ diagnosis: d, plan, ruleInputs: [{ kind: "totally-made-up" }] });
  assert.deepEqual(out, []);
});

test("proposal carries changedFields / expectedImpact / evidence / source / confidence (AC3)", () => {
  const d = { category: "SetupFailure", evidence: ["missing dispel"] };
  const out = proposeChanges({
    diagnosis: d, plan,
    ruleInputs: [{
      kind: "missing-dispel", id: "r1",
      changedFields: [{ field: "party", from: "c.d", to: "c.dispeller" }],
      evidence: ["prior run: 3 buffs uncleared"],
    }],
  });
  const p = out[0];
  assert.equal(p.dimension, DIMENSION.CHARACTERS);
  assert.ok(Array.isArray(p.changedFields) && p.changedFields.length === 1);
  assert.ok(p.expectedImpact && "assessment" in p.expectedImpact);
  assert.equal(p.confidence != null, true);
  assert.equal(p.source.diagnosisCategory, "SetupFailure");
  assert.equal(p.source.planId, "plan.faa");
  assert.equal(p.requiresApproval, true);
});

test("expected impact is InsufficientData when no estimator matches (AC4 no probability)", () => {
  const d = { category: "SetupFailure", evidence: [] };
  const out = proposeChanges({
    diagnosis: d, plan,
    ruleInputs: [{ kind: "missing-dispel", id: "r1", changedFields: [{ field: "party", from: "a", to: "b" }] }],
  });
  assert.equal(out[0].expectedImpact.assessment, "InsufficientData");
  assert.equal(out[0].expectedImpact.range, null);
});

test("engine forwards the picked objective onto every proposal (AC3 US-14-03)", () => {
  const d = { category: "RotationFailure", evidence: [] };
  const out = proposeChanges({
    diagnosis: d, plan, objectiveId: "fast-clear",
    ruleInputs: [{ kind: "mistimed-action", changedFields: [{ field: "rotation", from: "s1", to: "s2" }] }],
  });
  assert.equal(out[0].objective, "fast-clear");
});

// ---- experiments (US-14-02) ------------------------------------------------

function mkRun(fp, metrics) {
  return { fingerprintId: fingerprintId(fp), fingerprintFields: fp, metrics };
}

const fpA = { party: ["A"], gameDataVersion: "1.0.0" };
const fpB = { party: ["B"], gameDataVersion: "1.0.0" };

test("compareVariants reports InsufficientData below MIN_RUNS_PER_VARIANT (AC2)", () => {
  const runsA = Array.from({ length: 2 }, () => mkRun(fpA, { medianDamage: 100 }));
  const runsB = Array.from({ length: 2 }, () => mkRun(fpB, { medianDamage: 100 }));
  const cmp = compareVariants({ variantA: "A", variantB: "B", runsA, runsB, objectiveId: "max-damage" });
  assert.equal(cmp.perMetric.medianDamage.assessment, "InsufficientData");
  assert.equal(cmp.overall.assessment, "InsufficientData");
});

test("compareVariants reports Confirmed when ranges are fully separated (AC1)", () => {
  const runsA = Array.from({ length: MIN_RUNS_PER_VARIANT }, (_, i) => mkRun(fpA, { medianDamage: 1000 + i }));
  const runsB = Array.from({ length: MIN_RUNS_PER_VARIANT }, (_, i) => mkRun(fpB, { medianDamage: 500 + i }));
  const cmp = compareVariants({ variantA: "A", variantB: "B", runsA, runsB, objectiveId: "max-damage" });
  assert.equal(cmp.perMetric.medianDamage.winner, "A");
  assert.equal(cmp.perMetric.medianDamage.assessment, "Confirmed");
});

test("compareVariants flips winner sign for 'less is better' metrics (turns)", () => {
  const runsA = Array.from({ length: MIN_RUNS_PER_VARIANT }, (_, i) => mkRun(fpA, { turns: 10 + i }));
  const runsB = Array.from({ length: MIN_RUNS_PER_VARIANT }, (_, i) => mkRun(fpB, { turns: 20 + i }));
  const cmp = compareVariants({ variantA: "A", variantB: "B", runsA, runsB, objectiveId: "fast-clear" });
  assert.equal(cmp.perMetric.turns.winner, "A"); // fewer turns wins under "fast-clear"
});

test("compareVariants marks per-variant InsufficientData when fingerprints disagree (AC1 guarantee)", () => {
  const runsA = [mkRun(fpA, { medianDamage: 100 }), mkRun({ party: ["A2"] }, { medianDamage: 200 })];
  const runsB = Array.from({ length: MIN_RUNS_PER_VARIANT }, () => mkRun(fpB, { medianDamage: 300 }));
  const cmp = compareVariants({ variantA: "A", variantB: "B", runsA, runsB, objectiveId: "max-damage" });
  assert.equal(cmp.fingerprintsAgree.A, false);
  assert.equal(cmp.perMetric.medianDamage.assessment, "InsufficientData");
});

test("compareVariants never emits an aggregated percentage — only assessment labels (AC / §7.8)", () => {
  const runsA = Array.from({ length: MIN_RUNS_PER_VARIANT }, () => mkRun(fpA, { medianDamage: 1000 }));
  const runsB = Array.from({ length: MIN_RUNS_PER_VARIANT }, () => mkRun(fpB, { medianDamage: 500 }));
  const cmp = compareVariants({ variantA: "A", variantB: "B", runsA, runsB, objectiveId: "max-damage" });
  for (const m of METRICS) {
    const v = cmp.perMetric[m];
    for (const forbidden of ["probability", "score", "percent"]) {
      assert.ok(!(forbidden in v), `perMetric.${m} exposes forbidden field ${forbidden}`);
    }
  }
});

test("exportComparisonReport wraps the comparison as a portable JSON blob (AC3)", () => {
  const runsA = Array.from({ length: MIN_RUNS_PER_VARIANT }, () => mkRun(fpA, { medianDamage: 1000 }));
  const runsB = Array.from({ length: MIN_RUNS_PER_VARIANT }, () => mkRun(fpB, { medianDamage: 500 }));
  const cmp = compareVariants({ variantA: "A", variantB: "B", runsA, runsB, objectiveId: "max-damage" });
  const rep = exportComparisonReport(cmp, { extensionVersion: "1.2.3", now: 1_000_000 });
  assert.equal(rep.kind, "gbf-copilot/ab-comparison");
  assert.equal(rep.extensionVersion, "1.2.3");
  assert.equal(rep.exportedAt, 1_000_000);
  assert.ok(rep.comparison);
  assert.equal(rep.comparison.perMetric.medianDamage.assessment, "Confirmed");
});

// ---- proposals → variant (US-14-04) ---------------------------------------

const sourcePlan = {
  id: "plan.faa@v3", planId: "plan.faa", raidPlanVersion: 3,
  raidId: "faa", element: "wind", objective: "first-clear", status: "current",
  party: ["c.a", "c.b", "c.c", "c.d"],
  grid: ["w.1", "w.2", "w.3"],
  mainClass: "class.tank", mainSummon: "sum.wind",
  rotation: ["s.1", "s.2"], raidBonus: null,
};

const proposal = {
  id: "prop:missing-dispel:party",
  dimension: DIMENSION.CHARACTERS,
  changedFields: [{ field: "party", from: ["c.a", "c.b", "c.c", "c.d"], to: ["c.a", "c.b", "c.c", "c.dispeller"] }],
  expectedImpact: { range: null, assessment: "Uncertain" },
  evidence: ["missing dispel"],
  source: { diagnosisCategory: "SetupFailure", ruleInputKind: "missing-dispel", planId: "plan.faa" },
  confidence: "Likely",
  requiresApproval: true,
};

test("applyProposal produces a variant plan input with status=variant", () => {
  const input = applyProposal(sourcePlan, proposal);
  assert.equal(input.status, "variant");
  assert.equal(input.planId, "plan.faa-variant");
  assert.deepEqual(input.party, ["c.a", "c.b", "c.c", "c.dispeller"]);
  assert.equal(input.changeSource, "proposal:prop:missing-dispel:party");
  assert.equal(input.previousVersion, null);
});

test("applyProposal leaves untouched fields alone", () => {
  const input = applyProposal(sourcePlan, proposal);
  assert.deepEqual(input.grid, sourcePlan.grid);
  assert.deepEqual(input.rotation, sourcePlan.rotation);
});

test("applyProposal refuses malformed proposals", () => {
  assert.throws(() => applyProposal(sourcePlan, {}), /changedFields/);
  assert.throws(() => applyProposal(null, proposal), /sourcePlan/);
});

test("buildAuditEntry captures accept and reject decisions (AC2 audit trail)", () => {
  const accepted = buildAuditEntry({ proposal, decision: DECISION.ACCEPTED, plan: sourcePlan, now: 100 });
  const rejected = buildAuditEntry({ proposal, decision: DECISION.REJECTED, plan: sourcePlan, now: 200, userNote: "not now" });
  assert.equal(accepted.decision, "accepted");
  assert.equal(rejected.decision, "rejected");
  assert.equal(rejected.userNote, "not now");
  assert.equal(rejected.proposalId, proposal.id);
});

test("buildAuditEntry refuses unknown decisions", () => {
  assert.throws(() => buildAuditEntry({ proposal, decision: "maybe" }), /decision must be one of/);
});

test("compareProposalAgainstPlan feeds E07 US-07-07 compare view (AC3)", () => {
  const diff = compareProposalAgainstPlan(sourcePlan, proposal);
  assert.equal(diff.identical, false);
  assert.equal(diff.fields.party.same, false);
  assert.equal(diff.fields.grid.same, true);
});
