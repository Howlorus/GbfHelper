// US-14-03 optimization objectives (PRD §30). Declarative weights per objective.
// Pure. Weights are visible / auditable — the UI can render them next to any
// ranking so the player never wonders what "safe" or "fast" means numerically.
//
// Metric vocabulary matches US-14-02: median damage, damage variance, hit
// reliability, survival, omen success, turns, potion usage, knockouts,
// execution complexity. Higher weight → more influence. Sign matters:
//   +1  "more is better"  (medianDamage, survival, hitReliability, omenSuccess)
//   -1  "less is better"  (damageVariance, turns, potionUsage, knockouts, complexity)

export const OBJECTIVES = Object.freeze([
  "first-clear", "safe-solo", "fast-clear", "farming",
  "low-variance", "max-damage", "max-survival", "min-complexity",
]);

export const DEFAULT_OBJECTIVE = "first-clear";

const SIGNS = Object.freeze({
  medianDamage: +1, hitReliability: +1, survival: +1, omenSuccess: +1,
  damageVariance: -1, turns: -1, potionUsage: -1, knockouts: -1, complexity: -1,
});

// Weights ∈ [0, 3]. Zero silences a metric. Bigger = stronger pull.
const WEIGHTS = Object.freeze({
  "first-clear":     { survival: 3, omenSuccess: 3, hitReliability: 2, medianDamage: 1, knockouts: 2, complexity: 1, turns: 0, potionUsage: 0, damageVariance: 1 },
  "safe-solo":       { survival: 3, omenSuccess: 3, damageVariance: 2, knockouts: 3, hitReliability: 2, complexity: 1, medianDamage: 0, turns: 0, potionUsage: 1 },
  "fast-clear":      { turns: 3, medianDamage: 3, hitReliability: 2, complexity: 1, survival: 1, omenSuccess: 1, damageVariance: 1, potionUsage: 0, knockouts: 1 },
  "farming":         { turns: 3, medianDamage: 2, potionUsage: 3, complexity: 2, survival: 1, omenSuccess: 1, hitReliability: 1, damageVariance: 1, knockouts: 1 },
  "low-variance":    { damageVariance: 3, knockouts: 3, survival: 2, omenSuccess: 2, hitReliability: 2, medianDamage: 1, turns: 0, potionUsage: 0, complexity: 1 },
  "max-damage":      { medianDamage: 3, hitReliability: 1, damageVariance: 1, survival: 1, omenSuccess: 1, turns: 0, potionUsage: 0, complexity: 0, knockouts: 1 },
  "max-survival":    { survival: 3, knockouts: 3, omenSuccess: 2, potionUsage: 1, hitReliability: 2, medianDamage: 0, turns: 0, complexity: 1, damageVariance: 2 },
  "min-complexity":  { complexity: 3, hitReliability: 2, survival: 2, omenSuccess: 1, medianDamage: 1, damageVariance: 1, turns: 1, potionUsage: 1, knockouts: 1 },
});

export function isObjective(x) {
  return typeof x === "string" && OBJECTIVES.includes(x);
}

export function defaultObjective() { return DEFAULT_OBJECTIVE; }

// Return the raw weights for auditing / display (US-14-03 AC1).
export function weightsFor(objectiveId) {
  const id = isObjective(objectiveId) ? objectiveId : DEFAULT_OBJECTIVE;
  return { ...WEIGHTS[id] };
}

// Signed weights ready for scoring — sign encodes "more is better" vs "less is better".
export function signedWeights(objectiveId) {
  const w = weightsFor(objectiveId);
  const out = {};
  for (const k of Object.keys(w)) out[k] = w[k] * (SIGNS[k] || 0);
  return out;
}

export function metricSign(metric) { return SIGNS[metric] || 0; }
