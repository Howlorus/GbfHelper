import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInventoryContent } from "../src/lib/inventory-commit.js";
import { CATEGORIES } from "../src/lib/scan-status.js";

function buffer() {
  const b = { parserStatus: {}, warnings: [] };
  for (const c of CATEGORIES) b[c] = [];
  return b;
}

test("empty buffer -> zero records per category, Partial overall", () => {
  const c = buildInventoryContent(buffer());
  for (const cat of CATEGORIES) assert.deepEqual(c[cat], []);
  assert.equal(c.completeness.overall, "Partial");
});

test("mixed records -> correct counts + statuses + warnings passed through", () => {
  const b = buffer();
  b.characters = [{ completeness: "observed" }, { completeness: "observed" }];
  b.parserStatus.characters = "Complete";
  b.weapons = [{ completeness: "partial" }];
  b.parserStatus.weapons = "Partial";
  b.warnings = ["weapons: missing skill_level"];
  const c = buildInventoryContent(b);
  assert.equal(c.characters.length, 2);
  assert.equal(c.weapons.length, 1);
  assert.equal(c.completeness.perCategory.characters.status, "Complete");
  assert.equal(c.completeness.overall, "Partial");
  assert.deepEqual(c.warnings, ["weapons: missing skill_level"]);
});
