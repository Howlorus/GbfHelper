import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryRepository } from "../src/lib/repositories/in-memory.js";
import { STORE_NAMES } from "../src/lib/stores.js";
import { wrapEnvelope } from "../src/lib/envelope.js";
import { planQuickCleanup, planAdvancedCleanup, planWipeAll, applyCleanup } from "../src/lib/storage/cleanup.js";

function seededRepo() {
  const r = new InMemoryRepository(STORE_NAMES);
  const put = (store, id) => r.put(store, wrapEnvelope({ id }, { now: 1 }));
  return Promise.all([
    put("inventory", "current"),
    put("raidPlans", "plan-1@v1"),
    put("notes", "note-1"),
    put("searchIndexes", "idx-1"),
    put("sourceCache", "src-1"),
    put("diagnostics", "diag-1"),
  ]).then(() => r);
}

test("planQuickCleanup targets rebuildable stores only", () => {
  const plan = planQuickCleanup();
  for (const s of plan.stores) assert.ok(["searchIndexes", "sourceCache", "diagnostics"].includes(s));
  assert.ok(plan.stores.includes("searchIndexes"));
  assert.equal(plan.requireTypedConfirmation, undefined); // Quick Cleanup is always safe
});

test("planQuickCleanup + applyCleanup wipes rebuildable stores but preserves user data", async () => {
  const r = await seededRepo();
  await applyCleanup(r, planQuickCleanup());
  assert.equal((await r.list("searchIndexes")).length, 0);
  assert.equal((await r.list("sourceCache")).length, 0);
  assert.equal((await r.list("diagnostics")).length, 0);
  // Critical data untouched
  assert.equal((await r.list("inventory")).length, 1);
  assert.equal((await r.list("raidPlans")).length, 1);
  assert.equal((await r.list("notes")).length, 1);
});

test("planAdvancedCleanup with a critical store demands typed confirmation", () => {
  const plan = planAdvancedCleanup(["notes"]);
  assert.equal(plan.requireTypedConfirmation, true);
  assert.match(plan.reason, /critical.*notes/);
});

test("planAdvancedCleanup on rebuildable-only stores does NOT demand typed confirmation", () => {
  const plan = planAdvancedCleanup(["searchIndexes"]);
  assert.equal(plan.requireTypedConfirmation, false);
});

test("planAdvancedCleanup with no stores selected returns empty plan safely", () => {
  const plan = planAdvancedCleanup([]);
  assert.deepEqual(plan.stores, []);
  assert.equal(plan.requireTypedConfirmation, false);
});

test("planWipeAll always demands typed confirmation and covers every store", () => {
  const plan = planWipeAll(STORE_NAMES);
  assert.equal(plan.requireTypedConfirmation, true);
  assert.equal(plan.stores.length, STORE_NAMES.length);
});

test("applyCleanup reports before/after counts per store", async () => {
  const r = await seededRepo();
  const result = await applyCleanup(r, planQuickCleanup());
  assert.equal(result.before.searchIndexes, 1);
  assert.equal(result.after.searchIndexes, 0);
});
