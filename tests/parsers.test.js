import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePayload, PARSERS } from "../src/lib/parsers/index.js";
import "../src/lib/parsers/characters.js";

test("parsers registry includes 'characters'", () => {
  assert.ok(PARSERS.characters, "characters parser must be registered");
});

test("characters: parse a well-formed list", () => {
  const body = JSON.stringify({
    list: [
      { id: 3040001000, name: "Zeta", element: 3, rarity: 4, level: 100, evolution: 5,
        arousal_lv: 3, awakening_lv: 4, ring: 3, emp_level: 30 },
      { id: 3040002000, name: "Vane", element: 5, rarity: 3, level: 80, evolution: 4 },
    ],
  });
  const { records, status, warnings } = parsePayload("characters", body);
  assert.equal(records.length, 2);
  assert.equal(records[0].name, "Zeta");
  assert.equal(records[0].uncap, 5);
  assert.equal(records[0].transcendence, 3);
  assert.equal(records[0].completeness, "observed");
  assert.equal(records[1].completeness, "partial", "second record missing some fields");
  assert.equal(status, "Partial");
  assert.equal(warnings.length, 0);
});

test("characters: malformed JSON → Inconsistent", () => {
  const r = parsePayload("characters", "not json");
  assert.equal(r.status, "Inconsistent");
  assert.equal(r.records.length, 0);
});

test("characters: unknown top-level shape → Inconsistent or Filtered gracefully", () => {
  const r = parsePayload("characters", JSON.stringify({ error: "auth required" }));
  // With fallback to Object.values, an object without list yields non-record values.
  // Not-object entries are skipped; result set is empty → Filtered.
  assert.ok(["Inconsistent", "Filtered", "Partial"].includes(r.status));
});

test("unknown purpose returns Unsupported status", () => {
  const r = parsePayload("nowhere", "{}");
  assert.equal(r.status, "Unsupported");
});

test("empty body → Inconsistent", () => {
  const r = parsePayload("characters", "");
  assert.equal(r.status, "Inconsistent");
});
