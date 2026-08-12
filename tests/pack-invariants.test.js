// Cross-cutting invariants that span the whole pack pipeline. Any regression
// here means a security or isolation property has drifted.

import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryRepository } from "../src/lib/repositories/in-memory.js";
import { STORE_NAMES } from "../src/lib/stores.js";
import { wrapEnvelope } from "../src/lib/envelope.js";
import { sha256Hex, prepareInstall, installPack } from "../src/lib/packs/install.js";
import { removePack } from "../src/lib/packs/registry.js";

// Minimal well-formed strategy bundle. Only the fields the pipeline needs.
async function goodRawFiles() {
  const files = {
    "raid.json": '{"id":"x"}',
    "strategies.json": "[]",
    "rotations.json": "[]",
    "substitutions.json": "[]",
    "rules.json": "[]",
    "sources.json": "[]",
    "migrations.json": "[]",
  };
  const checksums = {};
  for (const [name, raw] of Object.entries(files)) checksums[name] = await sha256Hex(raw);
  return {
    "manifest.json": JSON.stringify({ id: "p1", name: "P1", version: "1.0.0", kind: "strategy", schemaVersion: 1 }),
    "checksums.json": JSON.stringify(checksums),
    ...files,
  };
}

test("US-04-05: installing a pack does NOT touch user data stores", async () => {
  const repo = new InMemoryRepository(STORE_NAMES);
  // Seed user data across the three §35.1 CRITICAL stores.
  await repo.put("inventory", wrapEnvelope({ id: "current", characters: ["me"] }, { now: 100 }));
  await repo.put("raidPlans", wrapEnvelope({ id: "plan-1", name: "solo" }, { now: 100 }));
  await repo.put("notes", wrapEnvelope({ id: "note-1", text: "hi" }, { now: 100 }));

  const prepared = await prepareInstall(await goodRawFiles());
  assert.equal(prepared.ok, true);
  await installPack(repo, prepared.bundle, { wrapEnvelope, now: 200, extensionVersion: "0.1.0" });

  // Every user store must be exactly as before.
  const inv = await repo.get("inventory", "current");
  const plan = await repo.get("raidPlans", "plan-1");
  const note = await repo.get("notes", "note-1");
  assert.deepEqual(inv.characters, ["me"]);
  assert.equal(plan.name, "solo");
  assert.equal(note.text, "hi");
  // Pack landed in strategyPacks.
  assert.equal((await repo.list("strategyPacks")).length, 1);
});

test("US-04-05: removing a pack does NOT touch user data stores", async () => {
  const repo = new InMemoryRepository(STORE_NAMES);
  await repo.put("inventory", wrapEnvelope({ id: "current", chars: 42 }, { now: 100 }));
  const prepared = await prepareInstall(await goodRawFiles());
  await installPack(repo, prepared.bundle, { wrapEnvelope, now: 200, extensionVersion: "0.1.0" });
  await removePack(repo, "strategy", "p1");
  const inv = await repo.get("inventory", "current");
  assert.equal(inv.chars, 42);
});

test("US-04-06: prepareInstall refuses a bundle that ships a .js file", async () => {
  const raw = await goodRawFiles();
  raw["helper.js"] = 'console.log("evil")';
  // No matching checksum, but the schema check fires first.
  const r = await prepareInstall(raw);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /non-declarative file forbidden.*helper\.js/.test(e)));
});

test("US-04-06: prepareInstall refuses a bundle that ships a .wasm file", async () => {
  const raw = await goodRawFiles();
  raw["macro.wasm"] = "\0";
  const r = await prepareInstall(raw);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /macro\.wasm/.test(e)));
});
