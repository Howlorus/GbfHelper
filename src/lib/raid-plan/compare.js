// Pure diff of two Raid Plans. Per-field { same } or { same:false, a, b }.

const FIELDS = [
  "raidId", "element", "objective", "status", "changeSource",
  "party", "grid", "mainClass", "mainSummon", "rotation", "raidBonus",
];

export function diffPlans(a, b) {
  const out = {};
  let changed = 0;
  for (const f of FIELDS) {
    const same = deepEqual(a?.[f], b?.[f]);
    out[f] = same ? { same: true } : { same: false, a: a?.[f] ?? null, b: b?.[f] ?? null };
    if (!same) changed++;
  }
  return { fields: out, changedCount: changed, identical: changed === 0 };
}

function deepEqual(x, y) {
  if (x === y) return true;
  if (x == null && y == null) return true;
  if (x == null || y == null) return false;
  if (typeof x !== "object" || typeof y !== "object") return false;
  if (Array.isArray(x) !== Array.isArray(y)) return false;
  const kx = Object.keys(x), ky = Object.keys(y);
  if (kx.length !== ky.length) return false;
  for (const k of kx) if (!deepEqual(x[k], y[k])) return false;
  return true;
}
