// Strategy matcher (PRD §19). Pure. Only the dimensions with a concrete
// data source in the current inventory (characters/weapons/summons) are
// covered — §19.2's coverage dimensions (damage, dispel, buff, defense…)
// land with the domain data that describes them.

export const READINESS = Object.freeze({
  UNKNOWN: "Unknown",
  READY_NOW: "ReadyNow",
  INSUFFICIENT_LEVEL: "InsufficientLevel",
  INSUFFICIENT_UNCAP: "InsufficientUncap",
  INSUFFICIENT_SKILL_LEVEL: "InsufficientSkillLevel",
  INCORRECT_AWAKENING: "IncorrectAwakening",
  DUPLICATE_REQUIRED: "DuplicateRequired",
});

const SEVERITY = {
  ReadyNow: 0, InsufficientLevel: 3, InsufficientUncap: 3,
  InsufficientSkillLevel: 3, IncorrectAwakening: 3, DuplicateRequired: 3,
  Unknown: 5,
};

export function matchStrategy(inventory, strategy) {
  const dims = {
    characters: (strategy?.requirements?.party || []).map((r) => checkCharacter(inventory, r)),
    weapons: (strategy?.requirements?.weapons || []).map((r) => checkWeapon(inventory, r)),
    summons: (strategy?.requirements?.summons || []).map((r) => checkSummon(inventory, r)),
  };
  return { dimensions: dims, overall: worstOf(dims) };
}

function checkCharacter(inv, req) {
  const item = (inv?.characters || []).find((c) => c.id === req.entityId);
  if (!item) return unknown(req);
  const gaps = [];
  if (req.minLevel != null && (item.level ?? 0) < req.minLevel)
    gaps.push({ state: READINESS.INSUFFICIENT_LEVEL, need: req.minLevel, have: item.level ?? null });
  if (req.minUncap != null && (item.uncap ?? 0) < req.minUncap)
    gaps.push({ state: READINESS.INSUFFICIENT_UNCAP, need: req.minUncap, have: item.uncap ?? null });
  if (req.minAwakening != null && (item.awakening ?? 0) < req.minAwakening)
    gaps.push({ state: READINESS.INCORRECT_AWAKENING, need: req.minAwakening, have: item.awakening ?? null });
  return decide(req, item, gaps);
}

function checkWeapon(inv, req) {
  const item = (inv?.weapons || []).find((w) => w.id === req.entityId);
  if (!item) return unknown(req);
  const gaps = [];
  if (req.minLevel != null && (item.level ?? 0) < req.minLevel)
    gaps.push({ state: READINESS.INSUFFICIENT_LEVEL, need: req.minLevel, have: item.level ?? null });
  if (req.minSkillLevel != null && (item.skillLevel ?? 0) < req.minSkillLevel)
    gaps.push({ state: READINESS.INSUFFICIENT_SKILL_LEVEL, need: req.minSkillLevel, have: item.skillLevel ?? null });
  if (req.minUncap != null && (item.uncap ?? 0) < req.minUncap)
    gaps.push({ state: READINESS.INSUFFICIENT_UNCAP, need: req.minUncap, have: item.uncap ?? null });
  if (req.minQuantity != null && (item.quantity ?? 1) < req.minQuantity)
    gaps.push({ state: READINESS.DUPLICATE_REQUIRED, need: req.minQuantity, have: item.quantity ?? 1 });
  return decide(req, item, gaps);
}

function checkSummon(inv, req) {
  const item = (inv?.summons || []).find((s) => s.id === req.entityId);
  if (!item) return unknown(req);
  const gaps = [];
  if (req.minLevel != null && (item.level ?? 0) < req.minLevel)
    gaps.push({ state: READINESS.INSUFFICIENT_LEVEL, need: req.minLevel, have: item.level ?? null });
  if (req.minUncap != null && (item.uncap ?? 0) < req.minUncap)
    gaps.push({ state: READINESS.INSUFFICIENT_UNCAP, need: req.minUncap, have: item.uncap ?? null });
  return decide(req, item, gaps);
}

function unknown(req) { return { role: req.role, entityId: req.entityId, state: READINESS.UNKNOWN, reason: "not in inventory" }; }

function decide(req, item, gaps) {
  return gaps.length === 0
    ? { role: req.role, entityId: item.id, state: READINESS.READY_NOW, gaps: [] }
    : { role: req.role, entityId: item.id, state: gaps[0].state, gaps };
}

function worstOf(dims) {
  let worst = READINESS.READY_NOW;
  for (const list of Object.values(dims)) {
    for (const item of list) {
      if ((SEVERITY[item.state] ?? 0) > (SEVERITY[worst] ?? 0)) worst = item.state;
    }
  }
  return worst;
}
