// Raid Plan record (§9.1/§9.2). Central product object. Flat shape so
// IndexedDB range queries + envelope wrapping stay simple.

export const RAID_PLAN_STATUSES = Object.freeze(["draft", "current", "variant", "archived"]);

const REQUIRED = ["id", "raidId", "element", "objective", "raidPlanVersion", "status"];

// Build a fresh plan record. Callers supply the required fields; anything
// missing gets a null so the shape stays uniform (no undefined leaks into
// storage / envelope wrapping).
export function buildRaidPlan(input) {
  if (!input || typeof input !== "object") throw new TypeError("input must be an object");
  const out = {
    id: input.id,
    raidId: input.raidId,
    element: input.element,
    objective: input.objective,
    raidPlanVersion: input.raidPlanVersion || 1,
    status: input.status || "draft",

    // §9.1 domain fields — nullable until the producer that fills them ships.
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

    // Provenance references.
    sourceStrategyPackId: input.sourceStrategyPackId ?? null,
    sourceStrategyPackVersion: input.sourceStrategyPackVersion ?? null,

    // Audit trail — every version records where the change came from.
    changeSource: input.changeSource || "user-edit",
    previousVersionId: input.previousVersionId ?? null,
  };
  validateRaidPlan(out);
  return out;
}

export function validateRaidPlan(rec) {
  if (!rec || typeof rec !== "object") throw new TypeError("raid plan must be an object");
  for (const k of REQUIRED) {
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
