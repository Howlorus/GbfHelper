import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryRepository } from "../src/lib/repositories/in-memory.js";
import { STORE_NAMES } from "../src/lib/stores.js";
import { wrapWithValidation } from "../src/lib/corruption.js";
import { savePlan, duplicatePlan, archivePlan, getPlan, listPlans } from "../src/lib/raid-plan/repository.js";

function newRepo() {
  return wrapWithValidation(new InMemoryRepository(STORE_NAMES));
}
function goodInput() {
  return { id: "plan-1", raidId: "bahamut-proud", element: "dark", objective: "first-clear" };
}

test("savePlan writes an envelope-wrapped raid plan into the raidPlans store", async () => {
  const r = newRepo();
  const rec = await savePlan(r, goodInput(), { now: 100 });
  assert.equal(rec.id, "plan-1");
  assert.equal(rec.raidPlanVersion, 1);
  assert.equal(rec.createdAt, 100);
  assert.equal(rec.updatedAt, 100);
  assert.deepEqual(await getPlan(r, "plan-1"), rec);
});

test("savePlan on an existing plan preserves createdAt and refreshes updatedAt", async () => {
  const r = newRepo();
  await savePlan(r, goodInput(), { now: 100 });
  const updated = await savePlan(r, { ...goodInput(), objective: "safe-solo" }, { now: 200 });
  assert.equal(updated.createdAt, 100);
  assert.equal(updated.updatedAt, 200);
  assert.equal(updated.objective, "safe-solo");
});

test("duplicatePlan copies content, resets version, marks status=variant + source=duplicated", async () => {
  const r = newRepo();
  await savePlan(r, { ...goodInput(), party: ["char.zeta"] }, { now: 100 });
  const dup = await duplicatePlan(r, "plan-1", { newId: "plan-2", now: 200 });
  assert.equal(dup.id, "plan-2");
  assert.equal(dup.status, "variant");
  assert.equal(dup.raidPlanVersion, 1);
  assert.equal(dup.changeSource, "duplicated");
  assert.deepEqual(dup.party, ["char.zeta"]);
});

test("duplicatePlan refuses without newId", async () => {
  const r = newRepo();
  await savePlan(r, goodInput());
  await assert.rejects(() => duplicatePlan(r, "plan-1", {}), /newId required/);
});

test("archivePlan sets status=archived and records the audit source", async () => {
  const r = newRepo();
  await savePlan(r, goodInput());
  const arc = await archivePlan(r, "plan-1", { now: 300 });
  assert.equal(arc.status, "archived");
  assert.equal(arc.changeSource, "archived");
});

test("listPlans filters by status and raidId", async () => {
  const r = newRepo();
  await savePlan(r, { ...goodInput(), id: "p1", status: "current" });
  await savePlan(r, { ...goodInput(), id: "p2", status: "variant" });
  await savePlan(r, { ...goodInput(), id: "p3", raidId: "belial" });
  assert.equal((await listPlans(r)).length, 3);
  assert.equal((await listPlans(r, { status: "variant" })).length, 1);
  assert.equal((await listPlans(r, { raidId: "belial" })).length, 1);
});

test("archivePlan / duplicatePlan on missing id throws", async () => {
  const r = newRepo();
  await assert.rejects(() => archivePlan(r, "nope"), /plan not found/);
  await assert.rejects(() => duplicatePlan(r, "nope", { newId: "x" }), /plan not found/);
});
