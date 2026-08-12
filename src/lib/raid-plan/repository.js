// Raid Plan repository operations. Each save creates a NEW record at
// id=`${planId}@v${n}`. History is queryable via listVersions.

import { wrapEnvelope } from "../envelope.js";
import { buildRaidPlan } from "./schema.js";

const STORE = "raidPlans";

async function versionsOf(repo, planId) {
  const all = await repo.list(STORE);
  return all.filter((p) => p.planId === planId).sort((a, b) => b.raidPlanVersion - a.raidPlanVersion);
}

export async function getCurrentPlan(repo, planId) {
  return (await versionsOf(repo, planId))[0] || null;
}

export async function listVersions(repo, planId) {
  return versionsOf(repo, planId);
}

export async function saveNewVersion(repo, input, { extensionVersion = "0.0.0", now = Date.now() } = {}) {
  const prior = (await versionsOf(repo, input.planId))[0] || null;
  const nextVersion = prior ? prior.raidPlanVersion + 1 : 1;
  const plan = buildRaidPlan({
    ...input,
    raidPlanVersion: nextVersion,
    previousVersion: prior ? prior.raidPlanVersion : null,
  });
  const record = wrapEnvelope(plan, { schemaVersion: 1, extensionVersion, now });
  await repo.put(STORE, record);
  return record;
}

export async function duplicatePlan(repo, sourcePlanId, { newPlanId, extensionVersion, now = Date.now() } = {}) {
  if (!newPlanId) throw new TypeError("newPlanId required");
  const src = await getCurrentPlan(repo, sourcePlanId);
  if (!src) throw new Error(`plan not found: ${sourcePlanId}`);
  return saveNewVersion(repo, {
    ...stripStorageKeys(src),
    planId: newPlanId,
    status: "variant",
    changeSource: "duplicated",
  }, { extensionVersion, now });
}

export async function archivePlan(repo, planId, meta = {}) {
  const src = await getCurrentPlan(repo, planId);
  if (!src) throw new Error(`plan not found: ${planId}`);
  return saveNewVersion(repo, {
    ...stripStorageKeys(src),
    status: "archived",
    changeSource: "archived",
  }, meta);
}

export async function revertToVersion(repo, planId, targetVersion, meta = {}) {
  const target = (await versionsOf(repo, planId)).find((p) => p.raidPlanVersion === targetVersion);
  if (!target) throw new Error(`plan version not found: ${planId}@v${targetVersion}`);
  return saveNewVersion(repo, {
    ...stripStorageKeys(target),
    status: "current",
    changeSource: `reverted-from-v${targetVersion}`,
  }, meta);
}

function stripStorageKeys(rec) {
  const { id, raidPlanVersion, createdAt, updatedAt, previousVersion, ...rest } = rec;
  return rest;
}
