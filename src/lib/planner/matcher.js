// Strategy matching engine (PRD §19). Pure. Takes the account inventory and
// a strategy template and produces a per-dimension readiness verdict using
// §14 Account Readiness states.

export const READINESS = Object.freeze({
  UNKNOWN: "Unknown",
  READY_NOW: "ReadyNow",
  INSUFFICIENT_LEVEL: "InsufficientLevel",
  INSUFFICIENT_UNCAP: "InsufficientUncap",
  INSUFFICIENT_SKILL_LEVEL: "InsufficientSkillLevel",
  INCORRECT_AWAKENING: "IncorrectAwakening",
  DUPLICATE_REQUIRED: "DuplicateRequired",
  EQUIPPED_ELSEWHERE: "EquippedElsewhere",
});

const SEVERITY = {
  ReadyNow: 0, Unknown: 5, InsufficientLevel: 3, InsufficientUncap: 3,
  InsufficientSkillLevel: 3, IncorrectAwakening: 3, DuplicateRequired: 3,
  EquippedElsewhere: 2,
};

// A strategy template minimum shape:
//   { raidId, element, objective, requirements: {
//       party: [{ role, entityId?, minLevel?, minUncap?, minAwakening? }],
//       weapons: [{ role, entityId?, minLevel?, minSkillLevel?, minUncap?, minQuantity? }],
//       summons: [{ role, entityId?, minLevel?, minUncap? }],
//       classes: ["sage"], classSkills: ["cleanup"]
//   }}
export function matchStrategy(inventory, strategy) {
  const dims = {
    characters: (strategy?.requirements?.party || []).map((r) => checkCharacter(inventory, r)),
    weapons: (strategy?.requirements?.weapons || []).map((r) => checkWeapon(inventory, r)),
    summons: (strategy?.requirements?.summons || []).map((r) => checkSummon(inventory, r)),
    classes: (strategy?.requirements?.classes || []).map((cls) => checkClass(inventory, cls)),
  };
  const overall = worstOf(dims);
  return { dimensions: dims, overall };
}

function checkCharacter(inv, req) {
  const item = (inv?.characters || []).find((c) => c.id === req.entityId);
  if (!item) return { role: req.role, entityId: req.entityId, state: READINESS.UNKNOWN, reason: "not in inventory" };
  const gaps = [];
  if (req.minLevel != null && (item.level ?? 0) < req.minLevel)
    gaps.push({ state: READINESS.INSUFFICIENT_LEVEL, need: req.minLevel, have: item.level ?? null });
  if (req.minUncap != null && (item.uncap ?? 0) < req.minUncap)
    gaps.push({ state: READINESS.INSUFFICIENT_UNCAP, need: req.minUncap, have: item.uncap ?? null });
  if (req.minAwakening != null && (item.awakening ?? 0) < req.minAwakening)
    gaps.push({ state: READINESS.INCORRECT_AWAKENING, need: req.minAwakening, have: item.awakening ?? null });
  return gaps.length === 0
    ? { role: req.role, entityId: item.id, state: READINESS.READY_NOW, gaps: [] }
    : { role: req.role, entityId: item.id, state: gaps[0].state, gaps };
}

function checkWeapon(inv, req) {
  const item = (inv?.weapons || []).find((w) => w.id === req.entityId);
  if (!item) return { role: req.role, entityId: req.entityId, state: READINESS.UNKNOWN, reason: "not in inventory" };
  const gaps = [];
  if (req.minLevel != null && (item.level ?? 0) < req.minLevel)
    gaps.push({ state: READINESS.INSUFFICIENT_LEVEL, need: req.minLevel, have: item.level ?? null });
  if (req.minSkillLevel != null && (item.skillLevel ?? 0) < req.minSkillLevel)
    gaps.push({ state: READINESS.INSUFFICIENT_SKILL_LEVEL, need: req.minSkillLevel, have: item.skillLevel ?? null });
  if (req.minUncap != null && (item.uncap ?? 0) < req.minUncap)
    gaps.push({ state: READINESS.INSUFFICIENT_UNCAP, need: req.minUncap, have: item.uncap ?? null });
  if (req.minQuantity != null && (item.quantity ?? 1) < req.minQuantity)
    gaps.push({ state: READINESS.DUPLICATE_REQUIRED, need: req.minQuantity, have: item.quantity ?? 1 });
  return gaps.length === 0
    ? { role: req.role, entityId: item.id, state: READINESS.READY_NOW, gaps: [] }
    : { role: req.role, entityId: item.id, state: gaps[0].state, gaps };
}

function checkSummon(inv, req) {
  const item = (inv?.summons || []).find((s) => s.id === req.entityId);
  if (!item) return { role: req.role, entityId: req.entityId, state: READINESS.UNKNOWN, reason: "not in inventory" };
  const gaps = [];
  if (req.minLevel != null && (item.level ?? 0) < req.minLevel)
    gaps.push({ state: READINESS.INSUFFICIENT_LEVEL, need: req.minLevel, have: item.level ?? null });
  if (req.minUncap != null && (item.uncap ?? 0) < req.minUncap)
    gaps.push({ state: READINESS.INSUFFICIENT_UNCAP, need: req.minUncap, have: item.uncap ?? null });
  return gaps.length === 0
    ? { role: req.role, entityId: item.id, state: READINESS.READY_NOW, gaps: [] }
    : { role: req.role, entityId: item.id, state: gaps[0].state, gaps };
}

function checkClass(inv, className) {
  const teams = inv?.teams || [];
  const owned = teams.some((t) => t?.mainClass === className);
  return owned
    ? { name: className, state: READINESS.READY_NOW }
    : { name: className, state: READINESS.UNKNOWN, reason: "class not seen on any saved team" };
}

function worstOf(dims) {
  let worst = READINESS.READY_NOW;
  let worstSev = SEVERITY[worst];
  for (const list of Object.values(dims)) {
    for (const item of list) {
      const sev = SEVERITY[item.state] ?? 0;
      if (sev > worstSev) { worst = item.state; worstSev = sev; }
    }
  }
  return worst;
}
