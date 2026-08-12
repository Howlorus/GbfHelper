// Pure diff of two Raid Plans. Returns per-field { same } or { same:false,
// a, b }. Consumers render side-by-side (Planner compare view, US-06-06,
// or Raid Plan version compare inside E07).

export const DIFF_FIELDS = Object.freeze([
  "raidId", "element", "objective", "status", "changeSource",
  "party", "backline", "mainClass", "classSkills",
  "grid", "mainSummon", "subSummons", "supportSummon",
  "raidBonus", "consumables",
  "rotation", "phaseRules", "triggerResponses", "omenResponses",
  "resourceConservationRules", "fallbackRules",
  "sourceStrategyPackId", "sourceStrategyPackVersion",
]);

export function diffPlans(a, b) {
  const out = {};
  let changed = 0;
  for (const f of DIFF_FIELDS) {
    const same = deepEqual(a?.[f], b?.[f]);
    out[f] = same ? { same: true } : { same: false, a: a?.[f] ?? null, b: b?.[f] ?? null };
    if (!same) changed++;
  }
  return { fields: out, changedCount: changed, identical: changed === 0 };
}

function deepEqual(x, y) {
  if (x === y) return true;
  if (x == null && y == null) return true; // null and undefined both count as absent
  if (x == null || y == null) return false;
  if (typeof x !== "object" || typeof y !== "object") return false;
  if (Array.isArray(x) !== Array.isArray(y)) return false;
  const kx = Object.keys(x), ky = Object.keys(y);
  if (kx.length !== ky.length) return false;
  for (const k of kx) if (!deepEqual(x[k], y[k])) return false;
  return true;
}
