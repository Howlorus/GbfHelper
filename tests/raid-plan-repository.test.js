import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryRepository } from "../src/lib/repositories/in-memory.js";
import { STORE_NAMES } from "../src/lib/stores.js";
import { wrapWithValidation } from "../src/lib/corruption.js";
import {
  saveNewVersion, duplicatePlan, archivePlan, revertToVersion,
  getCurrentPlan, listVersions, listCurrentPlans,
} from "../src/lib/raid-plan/repository.js";

function newRepo() { return wrapWithValidation(new InMemoryRepository(STORE_NAMES)); }
function goodInput() { return { planId: "plan-1", raidId: "bahamut-proud", element: "dark", objective: "first-clear" }; }

test("first saveNewVersion writes v1 with no previousVersion", async () => {
  const r = newRepo();
  const rec = await saveNewVersion(r, goodInput(), { now: 100 });
  assert.equal(rec.id, "plan-1@v1");
  assert.equal(rec.raidPlanVersion, 1);
  assert.equal(rec.previousVersion, null);
});

test("subsequent saveNewVersion increments and stamps previousVersion", async () => {
  const r = newRepo();
  await saveNewVersion(r, goodInput(), { now: 100 });
  const v2 = await saveNewVersion(r, { ...goodInput(), objective: "safe-solo" }, { now: 200 });
  assert.equal(v2.id, "plan-1@v2");
  assert.equal(v2.raidPlanVersion, 2);
  assert.equal(v2.previousVersion, 1);
  assert.equal(v2.objective, "safe-solo");
});

test("getCurrentPlan returns the highest-version record", async () => {
  const r = newRepo();
  await saveNewVersion(r, goodInput());
  await saveNewVersion(r, goodInput());
  await saveNewVersion(r, goodInput());
  assert.equal((await getCurrentPlan(r, "plan-1")).raidPlanVersion, 3);
});

test("listVersions returns every version sorted newest-first", async () => {
  const r = newRepo();
  await saveNewVersion(r, goodInput());
  await saveNewVersion(r, goodInput());
  await saveNewVersion(r, goodInput());
  const list = await listVersions(r, "plan-1");
  assert.deepEqual(list.map((v) => v.raidPlanVersion), [3, 2, 1]);
});

test("duplicatePlan copies current version into new family at v1", async () => {
  const r = newRepo();
  await saveNewVersion(r, { ...goodInput(), party: ["char.zeta"] });
  await saveNewVersion(r, { ...goodInput(), party: ["char.zeta", "char.vane"] });
  const dup = await duplicatePlan(r, "plan-1", { newPlanId: "plan-2" });
  assert.equal(dup.planId, "plan-2");
  assert.equal(dup.raidPlanVersion, 1);
  assert.equal(dup.status, "variant");
  assert.equal(dup.changeSource, "duplicated");
  assert.deepEqual(dup.party, ["char.zeta", "char.vane"]);
});

test("archivePlan creates a new version with status=archived", async () => {
  const r = newRepo();
  await saveNewVersion(r, goodInput());
  const arc = await archivePlan(r, "plan-1");
  assert.equal(arc.raidPlanVersion, 2);
  assert.equal(arc.status, "archived");
  assert.equal(arc.changeSource, "archived");
});

test("revertToVersion writes a new version with target's content and audit source", async () => {
  const r = newRepo();
  await saveNewVersion(r, { ...goodInput(), objective: "first-clear" });
  await saveNewVersion(r, { ...goodInput(), objective: "safe-solo" });
  const reverted = await revertToVersion(r, "plan-1", 1);
  assert.equal(reverted.raidPlanVersion, 3);
  assert.equal(reverted.objective, "first-clear");
  assert.match(reverted.changeSource, /reverted-from-v1/);
});

test("revertToVersion on a missing target throws", async () => {
  const r = newRepo();
  await saveNewVersion(r, goodInput());
  await assert.rejects(() => revertToVersion(r, "plan-1", 99), /version not found/);
});

test("listCurrentPlans returns one record per family + filters", async () => {
  const r = newRepo();
  await saveNewVersion(r, { ...goodInput() });
  await saveNewVersion(r, { ...goodInput(), objective: "safe-solo" });
  await saveNewVersion(r, { planId: "plan-2", raidId: "belial", element: "dark", objective: "first-clear" });
  assert.equal((await listCurrentPlans(r)).length, 2);
  const bp = await listCurrentPlans(r, { raidId: "bahamut-proud" });
  assert.equal(bp.length, 1);
  assert.equal(bp[0].raidPlanVersion, 2);
});

test("duplicatePlan refuses without newPlanId", async () => {
  const r = newRepo();
  await saveNewVersion(r, goodInput());
  await assert.rejects(() => duplicatePlan(r, "plan-1", {}), /newPlanId required/);
});

test("archivePlan / duplicatePlan on a missing family throw", async () => {
  const r = newRepo();
  await assert.rejects(() => archivePlan(r, "nope"), /plan not found/);
  await assert.rejects(() => duplicatePlan(r, "nope", { newPlanId: "x" }), /plan not found/);
});
