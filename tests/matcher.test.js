import { test } from "node:test";
import assert from "node:assert/strict";
import { matchStrategy, READINESS } from "../src/lib/planner/matcher.js";
import { missingReport } from "../src/lib/planner/missing-report.js";

const strategy = {
  raidId: "bahamut-proud",
  element: "dark",
  requirements: {
    party: [{ role: "dispel", entityId: "char.zeta", minLevel: 100, minUncap: 5, minAwakening: 3 }],
    weapons: [{ role: "main-hand", entityId: "wpn.excal", minLevel: 150, minSkillLevel: 15, minQuantity: 1 }],
    summons: [{ role: "main", entityId: "summon.bahamut", minLevel: 200, minUncap: 4 }],
  },
};

const goodInv = {
  characters: [{ id: "char.zeta", level: 100, uncap: 5, awakening: 3 }],
  weapons: [{ id: "wpn.excal", level: 150, skillLevel: 15, uncap: 5, quantity: 1 }],
  summons: [{ id: "summon.bahamut", level: 200, uncap: 4 }],
};

test("all requirements met -> ReadyNow overall, no gaps", () => {
  const r = matchStrategy(goodInv, strategy);
  assert.equal(r.overall, READINESS.READY_NOW);
  assert.equal(r.dimensions.characters[0].state, READINESS.READY_NOW);
});

test("missing character -> Unknown state with reason", () => {
  const r = matchStrategy({ characters: [], weapons: goodInv.weapons, summons: goodInv.summons }, strategy);
  assert.equal(r.dimensions.characters[0].state, READINESS.UNKNOWN);
  assert.match(r.dimensions.characters[0].reason, /not in inventory/);
});

test("insufficient level surfaces the first gap and captures need/have", () => {
  const inv = { ...goodInv, characters: [{ id: "char.zeta", level: 80, uncap: 5, awakening: 3 }] };
  const r = matchStrategy(inv, strategy);
  assert.equal(r.dimensions.characters[0].state, READINESS.INSUFFICIENT_LEVEL);
  assert.equal(r.dimensions.characters[0].gaps[0].need, 100);
  assert.equal(r.dimensions.characters[0].gaps[0].have, 80);
});

test("insufficient weapon quantity -> DuplicateRequired", () => {
  const inv = { ...goodInv, weapons: [{ id: "wpn.excal", level: 150, skillLevel: 15, uncap: 5, quantity: 0 }] };
  const r = matchStrategy(inv, strategy);
  assert.equal(r.dimensions.weapons[0].state, READINESS.DUPLICATE_REQUIRED);
});

test("overall aggregation reports the worst state across dimensions", () => {
  const inv = { ...goodInv, characters: [{ id: "char.zeta", level: 80, uncap: 5, awakening: 3 }], summons: [] };
  const r = matchStrategy(inv, strategy);
  assert.equal(r.overall, READINESS.UNKNOWN);
});

test("missingReport groups unmet per category and totals them", () => {
  const rep = missingReport(matchStrategy({ characters: [], weapons: [], summons: [] }, strategy));
  assert.equal(rep.total, 3);
  assert.equal(rep.perCategory.characters.length, 1);
});

test("missingReport returns 0 total when nothing is unmet", () => {
  assert.equal(missingReport(matchStrategy(goodInv, strategy)).total, 0);
});
