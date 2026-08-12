import { test } from "node:test";
import assert from "node:assert/strict";
import { MigrationRegistry, migrate } from "../src/lib/migrations.js";
import { InMemoryRepository } from "../src/lib/repositories/in-memory.js";

test("register requires forward adjacent steps (to === from + 1)", () => {
  const r = new MigrationRegistry();
  assert.throws(() => r.register(1, 3, () => ({})), /adjacent/);
  assert.throws(() => r.register(2, 1, () => ({})), /adjacent/);
});

test("plan(v1, v1) is empty; plan(v1, v3) chains v1->v2 and v2->v3", () => {
  const r = new MigrationRegistry();
  r.register(1, 2, (rec) => ({ ...rec, addedInV2: true }));
  r.register(2, 3, (rec) => ({ ...rec, addedInV3: true }));
  assert.equal(r.plan(1, 1).length, 0);
  assert.equal(r.plan(1, 3).length, 2);
});

test("downgrade is refused (forward-only for now)", () => {
  const r = new MigrationRegistry();
  r.register(1, 2, (rec) => rec);
  assert.throws(() => r.plan(2, 1), /downgrade not supported/);
});

test("plan throws when a step is missing", () => {
  const r = new MigrationRegistry();
  r.register(1, 2, (rec) => rec);
  assert.throws(() => r.plan(1, 3), /no migration between/);
});

test("applyAll stamps the target schemaVersion on the migrated record", () => {
  const r = new MigrationRegistry();
  r.register(1, 2, (rec) => ({ ...rec, newField: 42 }));
  r.register(2, 3, (rec) => ({ ...rec, another: "x" }));
  const out = r.applyAll({ id: 1, schemaVersion: 1 }, r.plan(1, 3));
  assert.equal(out.schemaVersion, 3);
  assert.equal(out.newField, 42);
  assert.equal(out.another, "x");
});

test("migrate(): all records advance to the target version", async () => {
  const repo = new InMemoryRepository(["inventory"]);
  await repo.put("inventory", { id: 1, schemaVersion: 1, name: "a" });
  await repo.put("inventory", { id: 2, schemaVersion: 1, name: "b" });
  const reg = new MigrationRegistry();
  reg.register(1, 2, (rec) => ({ ...rec, migrated: true }));
  await migrate(repo, ["inventory"], 2, reg);
  const rec = await repo.get("inventory", 1);
  assert.equal(rec.schemaVersion, 2);
  assert.equal(rec.migrated, true);
});

test("migrate(): a mid-way throw rolls back the whole store", async () => {
  const repo = new InMemoryRepository(["inventory"]);
  await repo.put("inventory", { id: 1, schemaVersion: 1, name: "a" });
  await repo.put("inventory", { id: 2, schemaVersion: 1, name: "b" });
  const reg = new MigrationRegistry();
  reg.register(1, 2, (rec) => {
    if (rec.id === 2) throw new Error("record 2 refuses to migrate");
    return { ...rec, migrated: true };
  });
  await assert.rejects(() => migrate(repo, ["inventory"], 2, reg), /refuses to migrate/);
  const rec1 = await repo.get("inventory", 1);
  assert.equal(rec1.schemaVersion, 1);
  assert.equal(rec1.migrated, undefined);
});
