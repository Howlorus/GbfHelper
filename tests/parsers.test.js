import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePayload, PARSERS } from "../src/lib/parsers/index.js";
import "../src/lib/parsers/characters.js";
import "../src/lib/parsers/weapons.js";
import "../src/lib/parsers/summons.js";
import "../src/lib/parsers/teams.js";

test("parsers registry covers all §13 categories", () => {
  for (const purpose of ["characters", "weapons", "summons", "teams"]) {
    assert.ok(PARSERS[purpose], `parser for '${purpose}' must be registered`);
  }
});

test("weapons: parse a well-formed list with instance ids and quantities", () => {
  const body = JSON.stringify({
    list: [
      { id: 1040800100, wid: 555001, level: 150, skill_level: 15, evolution: 5, awakening_lv: 3, count: 2, equipped: true },
      { id: 1040800200, wid: 555002, level: 100, skill_level: 10, evolution: 4, count: 1 },
    ],
  });
  const { records, status } = parsePayload("weapons", body);
  assert.equal(records.length, 2);
  assert.equal(records[0].instanceId, 555001);
  assert.equal(records[0].skillLevel, 15);
  assert.equal(records[0].equipped, true);
  assert.equal(records[0].completeness, "observed");
  assert.equal(records[1].completeness, "partial");
  assert.equal(status, "Partial");
});

test("summons: parses game id + instance id + level/uncap", () => {
  const body = JSON.stringify({
    list: [{ id: 2040100000, sid: 88801, level: 200, evolution: 4, count: 1, equipped: true }],
  });
  const { records, status } = parsePayload("summons", body);
  assert.equal(records.length, 1);
  assert.equal(records[0].id, 2040100000);
  assert.equal(records[0].instanceId, 88801);
  assert.equal(status, "Complete");
});

test("teams: parses party + backline + grid + summons references", () => {
  const body = JSON.stringify({
    list: [{
      id: "party-1", chara: [1, 2, 3], sub: [4, 5], job: "sage",
      job_skills: ["a", "b"], weapon: [10, 11, 12], main_summon: 20, sub_summons: [21, 22],
    }],
  });
  const { records, status } = parsePayload("teams", body);
  assert.equal(records.length, 1);
  assert.equal(records[0].partyId, "party-1");
  assert.equal(records[0].mainSummon, 20);
  assert.deepEqual(records[0].party, [1, 2, 3]);
  assert.equal(status, "Complete");
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

test("unknown top-level shape (no matching listKey) -> Inconsistent", () => {
  const r = parsePayload("characters", JSON.stringify({ error: "auth required" }));
  assert.equal(r.status, "Inconsistent");
  assert.equal(r.records.length, 0);
});

test("unknown purpose returns Unsupported status", () => {
  const r = parsePayload("nowhere", "{}");
  assert.equal(r.status, "Unsupported");
});

test("empty body → Inconsistent", () => {
  const r = parsePayload("characters", "");
  assert.equal(r.status, "Inconsistent");
});
