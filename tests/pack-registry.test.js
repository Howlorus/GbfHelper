import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryRepository } from "../src/lib/repositories/in-memory.js";
import { STORE_NAMES } from "../src/lib/stores.js";
import { wrapEnvelope } from "../src/lib/envelope.js";
import { removePack, setPackActive, listPacks, getPack, isCompatible } from "../src/lib/packs/registry.js";

function pack(id, extra = {}) {
  return wrapEnvelope({ id, name: id, kind: "strategy", active: true, ...extra }, { now: 100 });
}

test("removePack deletes only the target record and only from its kind's store", async () => {
  const repo = new InMemoryRepository(STORE_NAMES);
  await repo.put("strategyPacks", pack("a"));
  await repo.put("strategyPacks", pack("b"));
  await repo.put("gameData", pack("data-1", { kind: "gameData" }));
  await removePack(repo, "strategy", "a");
  assert.equal((await repo.list("strategyPacks")).length, 1);
  assert.equal((await repo.list("gameData")).length, 1); // untouched
});

test("setPackActive flips only the active flag; other fields preserved", async () => {
  const repo = new InMemoryRepository(STORE_NAMES);
  await repo.put("strategyPacks", pack("a", { name: "Alpha", version: "1.2.3" }));
  await setPackActive(repo, "strategy", "a", false);
  const rec = await repo.get("strategyPacks", "a");
  assert.equal(rec.active, false);
  assert.equal(rec.name, "Alpha");
  assert.equal(rec.version, "1.2.3");
});

test("setPackActive on a missing pack throws", async () => {
  const repo = new InMemoryRepository(STORE_NAMES);
  await assert.rejects(() => setPackActive(repo, "strategy", "no-such", true), /pack not found/);
});

test("listPacks: no filter -> all pack stores, filters by kind and active", async () => {
  const repo = new InMemoryRepository(STORE_NAMES);
  await repo.put("strategyPacks", pack("s1", { active: true }));
  await repo.put("strategyPacks", pack("s2", { active: false }));
  await repo.put("gameData", pack("g1", { kind: "gameData", active: true }));
  assert.equal((await listPacks(repo)).length, 3);
  assert.equal((await listPacks(repo, { kind: "strategy" })).length, 2);
  assert.equal((await listPacks(repo, { active: true })).length, 2);
});

test("getPack returns null when the pack does not exist", async () => {
  const repo = new InMemoryRepository(STORE_NAMES);
  assert.equal(await getPack(repo, "strategy", "nope"), null);
});

test("isCompatible: manifests without a requirement are always OK", () => {
  assert.deepEqual(isCompatible({}, "0.0.1"), { ok: true });
  assert.deepEqual(isCompatible({ requiredExtensionVersion: "" }, "0.0.1"), { ok: true });
});

test("isCompatible: current >= required semver -> OK; else fails with reason", () => {
  assert.equal(isCompatible({ requiredExtensionVersion: "0.1.0" }, "0.1.0").ok, true);
  assert.equal(isCompatible({ requiredExtensionVersion: "0.1.0" }, "1.0.0").ok, true);
  assert.equal(isCompatible({ requiredExtensionVersion: "1.0.0" }, "0.9.9").ok, false);
});

test("isCompatible: min: prefix supported for clarity", () => {
  assert.equal(isCompatible({ requiredExtensionVersion: "min:0.5.0" }, "0.9.0").ok, true);
});

test("isCompatible: garbage requirement is refused with a reason", () => {
  const r = isCompatible({ requiredExtensionVersion: "banana" }, "1.0.0");
  assert.equal(r.ok, false);
});
