import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryRepository } from "../src/lib/repositories/in-memory.js";

test("get / put / delete / list on a single store", async () => {
  const r = new InMemoryRepository(["alpha"]);
  await r.put("alpha", { id: 1, name: "a" });
  await r.put("alpha", { id: 2, name: "b" });
  assert.deepEqual(await r.get("alpha", 1), { id: 1, name: "a" });
  assert.equal((await r.list("alpha")).length, 2);
  assert.equal(await r.delete("alpha", 1), true);
  assert.equal(await r.get("alpha", 1), null);
});

test("clear empties the store without affecting others", async () => {
  const r = new InMemoryRepository(["a", "b"]);
  await r.put("a", { id: 1 });
  await r.put("b", { id: 2 });
  await r.clear("a");
  assert.equal((await r.list("a")).length, 0);
  assert.equal((await r.list("b")).length, 1);
});

test("unknown store name is refused (§7.6 isolation)", async () => {
  const r = new InMemoryRepository(["a"]);
  await assert.rejects(() => r.get("b", 1), /unknown store 'b'/);
});

test("put rejects records without an id", async () => {
  const r = new InMemoryRepository(["a"]);
  await assert.rejects(() => r.put("a", { name: "no id" }), /record\.id is required/);
});

test("transaction commits when the callback resolves and rolls back on throw", async () => {
  const r = new InMemoryRepository(["a"]);
  await r.put("a", { id: 1, v: "original" });
  await r.transaction(["a"], async (t) => {
    await t.put("a", { id: 2, v: "added" });
  });
  assert.equal((await r.list("a")).length, 2);
  await assert.rejects(() => r.transaction(["a"], async (t) => {
    await t.put("a", { id: 1, v: "mutated" });
    throw new Error("boom");
  }), /boom/);
  assert.deepEqual(await r.get("a", 1), { id: 1, v: "original" });
});
