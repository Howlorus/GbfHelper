import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryRepository } from "../src/lib/repositories/in-memory.js";
import { createStoreAccessors } from "../src/lib/store-accessors.js";
import { STORE_NAMES } from "../src/lib/stores.js";

function db() {
  return createStoreAccessors(new InMemoryRepository(STORE_NAMES));
}

test("accessor exists for every §7.6 store name", () => {
  const d = db();
  for (const name of STORE_NAMES) {
    assert.ok(d[name], `missing accessor for ${name}`);
    for (const m of ["get", "put", "delete", "list", "clear"]) {
      assert.equal(typeof d[name][m], "function", `${name}.${m} must be a function`);
    }
  }
  assert.equal(typeof d.transaction, "function");
});

test("put on raidPlans stays isolated from inventory", async () => {
  const d = db();
  await d.raidPlans.put({ id: "plan-1", name: "solo Bahamut" });
  await d.inventory.put({ id: "inv-1", characters: [] });
  const rp = await d.raidPlans.list();
  const inv = await d.inventory.list();
  assert.equal(rp.length, 1);
  assert.equal(inv.length, 1);
  assert.equal(rp[0].name, "solo Bahamut");
});

test("transaction is exposed and rolls back on throw", async () => {
  const d = db();
  await d.notes.put({ id: 1, text: "original" });
  await assert.rejects(() => d.transaction(["notes"], async (t) => {
    await t.put("notes", { id: 1, text: "mutated" });
    throw new Error("nope");
  }));
  const got = await d.notes.get(1);
  assert.equal(got.text, "original");
});

test("accessors are frozen (no adding methods post-hoc)", () => {
  const d = db();
  assert.throws(() => { d.raidPlans.evil = () => {}; }, TypeError);
  assert.throws(() => { d.newStore = "smuggled"; }, TypeError);
});
