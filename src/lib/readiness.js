// Account Readiness Model (§14). Pure function of (inventory item, requirement).
// The Planner (E06) consumes this per requirement dimension.
//
// The deciding gap is the FIRST unmet dimension in the check order below,
// which reflects the natural user-facing action priority (level up before
// uncapping, uncap before skill-leveling, etc.). Every gap is also returned
// in `gaps` for callers that want the full picture.

export const READINESS = Object.freeze({
  UNKNOWN: "Unknown",
  OWNED: "Owned",
  READY_NOW: "Ready now",
  READY_AFTER_UPGRADES: "Ready after upgrades",
  READY_AFTER_FARMING: "Ready after farming",
  INSUFFICIENT_LEVEL: "Insufficient level",
  INSUFFICIENT_UNCAP: "Insufficient uncap",
  INSUFFICIENT_SKILL_LEVEL: "Insufficient skill level",
  INCORRECT_AWAKENING: "Incorrect awakening",
  DUPLICATE_REQUIRED: "Duplicate required",
  LIMITED_RESOURCE_REQUIRED: "Limited resource required",
  EQUIPPED_ELSEWHERE: "Equipped elsewhere",
  NOT_CURRENTLY_ACHIEVABLE: "Not currently achievable",
});

export function computeReadiness(item, requirement) {
  if (!item) return { state: READINESS.UNKNOWN, deciding: { reason: "entity not in inventory" }, gaps: [] };
  const req = requirement || {};
  const gaps = [];

  pushGap(gaps, req.requiredLevel, item.level, READINESS.INSUFFICIENT_LEVEL, "level");
  pushGap(gaps, req.requiredUncap, item.uncap, READINESS.INSUFFICIENT_UNCAP, "uncap");
  pushGap(gaps, req.requiredSkillLevel, item.skillLevel, READINESS.INSUFFICIENT_SKILL_LEVEL, "skillLevel");

  if (req.requiredAwakening != null && item.awakening !== req.requiredAwakening) {
    gaps.push({ state: READINESS.INCORRECT_AWAKENING, dim: "awakening", need: req.requiredAwakening, have: item.awakening ?? null });
  }
  if (req.requiredQuantity != null) {
    const have = item.quantity ?? 1;
    if (have < req.requiredQuantity) {
      gaps.push({ state: READINESS.DUPLICATE_REQUIRED, dim: "quantity", need: req.requiredQuantity, have });
    }
  }
  if (req.requiresFreeSlot && item.equipped) {
    gaps.push({ state: READINESS.EQUIPPED_ELSEWHERE, dim: "equipped", need: "free slot", have: "equipped" });
  }
  if (req.requiredLimitedResource && !itemHoldsResource(item, req.requiredLimitedResource)) {
    gaps.push({ state: READINESS.LIMITED_RESOURCE_REQUIRED, dim: "limitedResource",
      need: req.requiredLimitedResource, have: null });
  }

  if (gaps.length === 0) return { state: READINESS.READY_NOW, deciding: null, gaps: [] };
  return { state: gaps[0].state, deciding: gaps[0], gaps };
}

function pushGap(gaps, required, actual, gapState, dim) {
  if (required == null) return;
  if (actual == null || actual < required) {
    gaps.push({ state: gapState, dim, need: required, have: actual ?? null });
  }
}

function itemHoldsResource(item, resourceId) {
  // Placeholder: real inventory records will carry a limitedResources array.
  const arr = item.limitedResources;
  return Array.isArray(arr) && arr.includes(resourceId);
}
