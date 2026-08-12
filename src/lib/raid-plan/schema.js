// Raid Plan record (§9.1/§9.2). id = `${planId}@v${raidPlanVersion}`;
// planId groups the family, raidPlanVersion orders. Only fields with a
// realistic MVP producer are declared — extra §9.1 fields land with the
// writer that fills them.

export const RAID_PLAN_STATUSES = Object.freeze(["draft", "current", "variant", "archived"]);

export function storageId(planId, version) {
  return `${planId}@v${version}`;
}

export function buildRaidPlan(input) {
  if (!input || typeof input !== "object") throw new TypeError("input must be an object");
  if (typeof input.planId !== "string" || !input.planId) throw new TypeError("input.planId required");
  const version = input.raidPlanVersion || 1;
  const out = {
    id: storageId(input.planId, version),
    planId: input.planId,
    raidPlanVersion: version,
    raidId: input.raidId,
    element: input.element,
    objective: input.objective,
    status: input.status || "current",

    party: input.party ?? [],
    grid: input.grid ?? [],
    mainClass: input.mainClass ?? null,
    mainSummon: input.mainSummon ?? null,
    rotation: input.rotation ?? [],
    raidBonus: input.raidBonus ?? null,

    changeSource: input.changeSource || "user-edit",
    previousVersion: input.previousVersion ?? null,
  };
  validateRaidPlan(out);
  return out;
}

export function validateRaidPlan(rec) {
  if (!rec || typeof rec !== "object") throw new TypeError("raid plan must be an object");
  for (const k of ["id", "planId", "raidId", "element", "objective", "raidPlanVersion", "status"]) {
    if (rec[k] === undefined || rec[k] === null || rec[k] === "") {
      throw new TypeError(`raid plan.${k} required`);
    }
  }
  if (!RAID_PLAN_STATUSES.includes(rec.status)) {
    throw new TypeError(`raid plan.status must be one of ${RAID_PLAN_STATUSES.join("|")}`);
  }
  if (typeof rec.raidPlanVersion !== "number" || rec.raidPlanVersion < 1) {
    throw new TypeError("raid plan.raidPlanVersion must be a positive number");
  }
  return true;
}
