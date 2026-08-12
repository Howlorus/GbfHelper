// US-14-01 Optimization Engine (PRD §28). Pure.
//
// Input: diagnosis (E10), a Raid Plan (E07), a list of ruleInputs (declarative
// hints from the diagnosis / Live Coach), and an objective (US-14-03).
// Output: proposals, each pointing at one §28 dimension with expected impact
// as a §33 range + assessment (never a "success probability").
//
// AC2 (honesty): VarianceIssue / ObservationFailure diagnoses OR empty
// ruleInputs → zero proposals. Never fabricate one.
// AC3: every proposal carries changedFields, expectedImpact, evidence,
// source, confidence.
// AC4: no composite score is emitted — only §33 assessment labels.

import { isObjective, defaultObjective } from "./objectives.js";

// §28 dimensions the engine can target.
export const DIMENSION = Object.freeze({
  CHARACTERS: "characters",
  GRID: "grid",
  CLASS: "class",
  SUMMONS: "summons",
  BONUS_CONSUMABLES: "bonusConsumables",
  ROTATION: "rotation",
});

// Rule-input kinds we translate into proposals. Extend when new diagnosis
// evidence lands. AC1: at least one rule input must match to emit a proposal.
const KIND_TO_DIMENSION = Object.freeze({
  "missing-capability":       DIMENSION.CHARACTERS,
  "missing-dispel":           DIMENSION.CHARACTERS,
  "missing-omen-coverage":    DIMENSION.CHARACTERS,
  "grid-slot-swap":           DIMENSION.GRID,
  "class-skill-swap":         DIMENSION.CLASS,
  "summon-order-swap":        DIMENSION.SUMMONS,
  "bonus-swap":               DIMENSION.BONUS_CONSUMABLES,
  "mistimed-action":          DIMENSION.ROTATION,
  "out-of-range-prediction":  DIMENSION.ROTATION,
});

const HONEST_CATEGORIES = new Set([
  "SetupFailure", "RotationFailure", "PredictionFailure",
  // Historical §27 verdicts that don't produce actionable proposals:
  // ObservationFailure and VarianceIssue are handled by AC2 and return [].
]);

export function proposeChanges({ diagnosis, plan, ruleInputs = [], objectiveId, estimator = null } = {}) {
  const objective = isObjective(objectiveId) ? objectiveId : defaultObjective();
  if (!diagnosis || !plan) return [];
  if (!HONEST_CATEGORIES.has(diagnosis.category)) return [];       // AC2
  if (!Array.isArray(ruleInputs) || ruleInputs.length === 0) return []; // AC2

  const proposals = [];
  for (const input of ruleInputs) {
    const dimension = KIND_TO_DIMENSION[input?.kind];
    if (!dimension) continue;
    const p = buildProposal({ input, dimension, plan, diagnosis, objective, estimator });
    if (p) proposals.push(p);
  }
  return proposals;
}

function buildProposal({ input, dimension, plan, diagnosis, objective, estimator }) {
  const changedFields = input.changedFields || describeChanges(input, plan);
  if (!changedFields.length) return null;

  const impact = estimateImpact({ input, estimator, plan });
  const confidence = input.confidence || impact.assessment || "Uncertain";

  return {
    id: `prop:${input.kind}:${input.id || changedFields.map((c) => c.field).join(",")}`,
    dimension,
    target: input.target || null,
    objective,
    changedFields,
    expectedImpact: impact,          // {range, assessment} — never a percentage (AC4)
    evidence: [
      ...(diagnosis.evidence || []),
      ...(input.evidence || []),
    ],
    source: {
      diagnosisCategory: diagnosis.category,
      ruleInputKind: input.kind,
      ruleInputId: input.id || null,
      planId: plan.planId,
      planVersion: plan.raidPlanVersion,
    },
    confidence,
    requiresApproval: true,          // §7.7 — no auto-apply
  };
}

function describeChanges(input, plan) {
  // ponytail: the caller usually supplies input.changedFields already.
  // Fall back to a minimal single-field describe from input.target + input.propose.
  if (input.target && input.propose && input.field) {
    return [{
      dimension: input.field,
      field: input.field,
      from: readField(plan, input.field, input.target),
      to: input.propose,
    }];
  }
  return [];
}

function readField(plan, field, target) {
  const val = plan?.[field];
  if (Array.isArray(val) && target && typeof target === "object" && "index" in target) {
    return val[target.index] ?? null;
  }
  return val ?? null;
}

// AC4: §33 range + assessment only. If no estimator or no calibration match,
// the impact stays InsufficientData — nothing else.
function estimateImpact({ input, estimator }) {
  if (typeof estimator === "function") {
    try {
      const est = estimator(input);
      if (est && est.assessment) return est;
    } catch { /* ignore — fall through */ }
  }
  if (input.expectedImpact && input.expectedImpact.assessment) return input.expectedImpact;
  return { range: null, assessment: "InsufficientData" };
}
