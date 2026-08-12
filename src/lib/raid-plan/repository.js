// Raid Plan repository operations. Callers pass a Repository (usually the
// SW's wrapWithValidation(IndexedDBRepository)); this module knows only
// the store name and the plan-specific shape.

import { wrapEnvelope } from "../envelope.js";
import { buildRaidPlan } from "./schema.js";

const STORE = "raidPlans";

export async function savePlan(repo, planInput, { extensionVersion = "0.0.0", now = Date.now() } = {}) {
  const previous = planInput.id ? await repo.get(STORE, planInput.id) : null;
  const plan = buildRaidPlan(planInput);
  const record = wrapEnvelope(plan, { schemaVersion: 1, extensionVersion, now, previous });
  await repo.put(STORE, record);
  return record;
}

export async function duplicatePlan(repo, sourceId, { newId, extensionVersion, now = Date.now() } = {}) {
  if (!newId) throw new TypeError("newId required");
  const src = await repo.get(STORE, sourceId);
  if (!src) throw new Error(`plan not found: ${sourceId}`);
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = src;
  return savePlan(repo, {
    ...rest,
    id: newId,
    status: "variant",
    raidPlanVersion: 1,
    previousVersionId: null,
    changeSource: "duplicated",
  }, { extensionVersion, now });
}

export async function archivePlan(repo, planId, { extensionVersion, now = Date.now() } = {}) {
  const src = await repo.get(STORE, planId);
  if (!src) throw new Error(`plan not found: ${planId}`);
  return savePlan(repo, {
    ...src,
    status: "archived",
    changeSource: "archived",
  }, { extensionVersion, now });
}

export async function getPlan(repo, planId) {
  return repo.get(STORE, planId);
}

export async function listPlans(repo, { status, raidId } = {}) {
  const all = await repo.list(STORE);
  return all.filter((p) =>
    (status === undefined || p.status === status) &&
    (raidId === undefined || p.raidId === raidId)
  );
}
