import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInventoryFromBuffer, summarizeReport, CATEGORIES } from "../src/lib/inventory-commit.js";

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

test("buildInventoryFromBuffer is pure — input buffer is not mutated", () => {
  const b = buffer();
  b.characters = [{ completeness: "observed" }];
  const before = JSON.stringify(b);
  buildInventoryFromBuffer(b);
  assert.equal(JSON.stringify(b), before);
});

test("summarizeReport gives a one-liner per category with counts", () => {
  const b = buffer();
  b.characters = [{ completeness: "observed" }];
  b.parserStatus.characters = "Complete";
  const inv = buildInventoryFromBuffer(b);
  const line = summarizeReport(inv.completeness);
  assert.ok(line.includes("characters: Complete (1)"));
  assert.ok(line.includes("weapons: Partial (0)"));
});
