// Raid Plan record (§9.1/§9.2). Storage id encodes the version:
//   id = `${planId}@v${raidPlanVersion}`
// so every version is a distinct record. planId groups the family;
// raidPlanVersion orders them. §9.1 domain fields default nullable until
// a producer fills them (E08/E10/E14).

export const RAID_PLAN_STATUSES = Object.freeze(["draft", "current", "variant", "archived"]);

export function storageId(planId, version) {
  return `${planId}@v${version}`;
}

export function parseStorageId(id) {
  const m = /^(.+)@v(\d+)$/.exec(String(id || ""));
  return m ? { planId: m[1], version: +m[2] } : null;
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
    backline: input.backline ?? [],
    mainClass: input.mainClass ?? null,
    classSkills: input.classSkills ?? [],
    grid: input.grid ?? [],
    mainSummon: input.mainSummon ?? null,
    subSummons: input.subSummons ?? [],
    supportSummon: input.supportSummon ?? null,
    raidBonus: input.raidBonus ?? null,
    consumables: input.consumables ?? [],
    rotation: input.rotation ?? [],
    phaseRules: input.phaseRules ?? [],
    triggerResponses: input.triggerResponses ?? [],
    omenResponses: input.omenResponses ?? [],
    resourceConservationRules: input.resourceConservationRules ?? [],
    fallbackRules: input.fallbackRules ?? [],

    sourceStrategyPackId: input.sourceStrategyPackId ?? null,
    sourceStrategyPackVersion: input.sourceStrategyPackVersion ?? null,

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
