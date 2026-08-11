import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInventoryFromBuffer, planCommit } from "../src/lib/inventory-commit.js";
import { CATEGORIES } from "../src/lib/scan-status.js";

function buffer() {
  const b = { parserStatus: {}, warnings: [] };
  for (const c of CATEGORIES) b[c] = [];
  return b;
}

test("empty buffer yields an inventory with zero records per category and Partial overall", () => {
  const inv = buildInventoryFromBuffer(buffer(), { schemaVersion: 1, extensionVersion: "0.0.1", committedAt: 42 });
  for (const c of CATEGORIES) assert.deepEqual(inv[c], []);
  assert.equal(inv.completeness.overall, "Partial");
  assert.equal(inv.schemaVersion, 1);
  assert.equal(inv.extensionVersion, "0.0.1");
  assert.equal(inv.committedAt, 42);
});

test("buffer with mixed records produces a snapshot with the correct counts + statuses", () => {
  const b = buffer();
  b.characters = [{ completeness: "observed" }, { completeness: "observed" }];
  b.parserStatus.characters = "Complete";
  b.weapons = [{ completeness: "partial" }];
  b.parserStatus.weapons = "Partial";
  b.warnings = ["weapons: missing skill_level"];
  const inv = buildInventoryFromBuffer(b);
  assert.equal(inv.characters.length, 2);
  assert.equal(inv.weapons.length, 1);
  assert.equal(inv.completeness.perCategory.characters.status, "Complete");
  assert.equal(inv.completeness.perCategory.weapons.status, "Partial");
  assert.equal(inv.completeness.overall, "Partial");
  assert.deepEqual(inv.warnings, ["weapons: missing skill_level"]);
});

test("planCommit with no prior inventory writes only { inventory }", () => {
  const delta = planCommit(null, buffer(), { schemaVersion: 1, extensionVersion: "0.0.1", committedAt: 1 });
  assert.ok(delta.inventory);
  assert.equal(delta.inventoryPrev, undefined);
});

test("planCommit with a prior inventory produces an atomic { inventory, inventoryPrev } delta", () => {
  const old = { schemaVersion: 1, committedAt: 100, characters: [{ x: 1 }] };
  const delta = planCommit(old, buffer(), { schemaVersion: 1, extensionVersion: "0.0.1", committedAt: 200 });
  // Both keys present -> chrome.storage.local.set(delta) is atomic across them,
  // so a mid-write crash cannot leave one written and the other stale.
  assert.deepEqual(delta.inventoryPrev, old);
  assert.equal(delta.inventory.committedAt, 200);
});

test("planCommit is pure — inputs are not mutated", () => {
  const b = buffer();
  b.characters = [{ completeness: "observed" }];
  const old = { committedAt: 100 };
  const beforeB = JSON.stringify(b);
  const beforeOld = JSON.stringify(old);
  planCommit(old, b, { committedAt: 200 });
  assert.equal(JSON.stringify(b), beforeB);
  assert.equal(JSON.stringify(old), beforeOld);
});
