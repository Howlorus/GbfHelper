import { test } from "node:test";
import assert from "node:assert/strict";
import { MigrationRegistry, migrate } from "../src/lib/migrations.js";
import { InMemoryRepository } from "../src/lib/repositories/in-memory.js";

test("register requires adjacent-version steps", () => {
  const r = new MigrationRegistry();
  assert.throws(() => r.register(1, 3, () => ({})), /adjacent-version/);
});

test("plan(v1, v1) is empty; plan(v1, v3) chains v1->v2 and v2->v3", () => {
  const r = new MigrationRegistry();
  r.register(1, 2, (rec) => ({ ...rec, addedInV2: true }));
  r.register(2, 3, (rec) => ({ ...rec, addedInV3: true }));
  assert.equal(r.plan(1, 1).length, 0);
  const steps = r.plan(1, 3);
  assert.equal(steps.length, 2);
  assert.equal(steps[0].direction, "forward");
  assert.equal(steps[1].direction, "forward");
});

test("plan throws when a step is missing between current and target", () => {
  const r = new MigrationRegistry();
  r.register(1, 2, (rec) => rec);
  assert.throws(() => r.plan(1, 3), /no migration between/);
});

test("applyAll forward stamps the target schemaVersion on the record", () => {
  const r = new MigrationRegistry();
  r.register(1, 2, (rec) => ({ ...rec, newField: 42 }));
  r.register(2, 3, (rec) => ({ ...rec, another: "x" }));
  const migrated = r.applyAll({ id: 1, schemaVersion: 1 }, r.plan(1, 3));
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.newField, 42);
  assert.equal(migrated.another, "x");
});

test("reverse migration roundtrips forward + reverse to the original record", () => {
  const r = new MigrationRegistry();
  r.register(1, 2, (rec) => ({ ...rec, upgraded: true }), (rec) => {
    const { upgraded, ...rest } = rec;
    return rest;
  });
  const original = { id: 1, schemaVersion: 1, name: "a" };
  const forward = r.applyAll(original, r.plan(1, 2));
  assert.equal(forward.upgraded, true);
  assert.equal(forward.schemaVersion, 2);
  const back = r.applyAll(forward, r.plan(2, 1));
  assert.deepEqual(back, original);
});

test("reverse migration fails if no reverse was registered", () => {
  const r = new MigrationRegistry();
  r.register(1, 2, (rec) => ({ ...rec, x: 1 })); // no reverse
  assert.throws(() => r.applyAll({ id: 1, schemaVersion: 2 }, r.plan(2, 1)), /no reverse migration/);
});

test("migrate(): all records in the store advance to the target version", async () => {
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

test("migrate(): if a step throws, the whole store rolls back to pre-migration state", async () => {
  const repo = new InMemoryRepository(["inventory"]);
  await repo.put("inventory", { id: 1, schemaVersion: 1, name: "a" });
  await repo.put("inventory", { id: 2, schemaVersion: 1, name: "b" });
  const reg = new MigrationRegistry();
  reg.register(1, 2, (rec) => {
    if (rec.id === 2) throw new Error("record 2 refuses to migrate");
    return { ...rec, migrated: true };
  });
  await assert.rejects(() => migrate(repo, ["inventory"], 2, reg), /refuses to migrate/);
  // Both records still on v1 (rollback).
  const rec1 = await repo.get("inventory", 1);
  const rec2 = await repo.get("inventory", 2);
  assert.equal(rec1.schemaVersion, 1);
  assert.equal(rec2.schemaVersion, 1);
  assert.equal(rec1.migrated, undefined);
});
