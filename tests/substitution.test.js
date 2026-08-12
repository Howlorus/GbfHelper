import { test } from "node:test";
import assert from "node:assert/strict";
import { proposeSubstitutions } from "../src/lib/planner/substitution.js";

const substitutions = [{
  role: "dispel",
  kind: "character",
  mandatory: ["dispel", "defensive-buff"],
  optional: ["12-hit"],
  candidates: [
    { entityId: "char.vane", covers: ["dispel", "defensive-buff"], notCovered: ["12-hit"], adaptation: "Reserve Summon C for the hit-count omen", confidence: "medium" },
    { entityId: "char.ranulf", covers: ["dispel"], notCovered: ["defensive-buff", "12-hit"], adaptation: null, confidence: "low" },
    { entityId: "char.uncovered", covers: [], notCovered: ["dispel", "defensive-buff"], adaptation: null, confidence: "low" },
  ],
}];

const inv = {
  characters: [{ id: "char.vane" }, { id: "char.ranulf" }, { id: "char.uncovered" }, { id: "char.zeta" }],
};

test("returns owned candidates that cover at least one mandatory capability", () => {
  const r = proposeSubstitutions(substitutions, "dispel", inv);
  assert.equal(r.length, 2);
  assert.ok(r.every((c) => c.covers.length > 0));
});

test("candidates are ordered by confidence (high before low)", () => {
  const r = proposeSubstitutions(substitutions, "dispel", inv);
  assert.equal(r[0].entityId, "char.vane"); // medium beats low
  assert.equal(r[1].entityId, "char.ranulf");
});

test("candidates NOT owned are silently dropped", () => {
  const partial = { characters: [{ id: "char.vane" }] };
  const r = proposeSubstitutions(substitutions, "dispel", partial);
  assert.equal(r.length, 1);
  assert.equal(r[0].entityId, "char.vane");
});

test("no owned candidate covers a mandatory capability -> empty (never fabricated)", () => {
  const emptyInv = { characters: [{ id: "char.uncovered" }] };
  const r = proposeSubstitutions(substitutions, "dispel", emptyInv);
  assert.deepEqual(r, []);
});

test("unknown role -> empty list", () => {
  const r = proposeSubstitutions(substitutions, "nowhere", inv);
  assert.deepEqual(r, []);
});

test("candidate payload preserves §20 fields (covers/notCovered/adaptation/confidence)", () => {
  const [c] = proposeSubstitutions(substitutions, "dispel", inv);
  assert.deepEqual(c.covers, ["dispel", "defensive-buff"]);
  assert.deepEqual(c.notCovered, ["12-hit"]);
  assert.match(c.adaptation, /Reserve Summon C/);
  assert.equal(c.confidence, "medium");
});

test("empty / malformed inputs are safe (no throw)", () => {
  assert.deepEqual(proposeSubstitutions(null, "dispel", inv), []);
  assert.deepEqual(proposeSubstitutions(substitutions, "dispel", null), []);
  assert.deepEqual(proposeSubstitutions([], "dispel", inv), []);
});
