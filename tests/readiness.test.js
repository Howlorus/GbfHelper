import { test } from "node:test";
import assert from "node:assert/strict";
import { READINESS, computeReadiness } from "../src/lib/readiness.js";

test("missing inventory item -> Unknown", () => {
  const r = computeReadiness(null, { requiredLevel: 100 });
  assert.equal(r.state, READINESS.UNKNOWN);
});

test("all requirements met -> Ready now, no gaps", () => {
  const item = { level: 100, uncap: 5, skillLevel: 15, awakening: 3, quantity: 2 };
  const req = { requiredLevel: 100, requiredUncap: 5, requiredSkillLevel: 15, requiredAwakening: 3, requiredQuantity: 2 };
  const r = computeReadiness(item, req);
  assert.equal(r.state, READINESS.READY_NOW);
  assert.equal(r.gaps.length, 0);
});

test("level below requirement -> Insufficient level with need/have", () => {
  const r = computeReadiness({ level: 80 }, { requiredLevel: 100 });
  assert.equal(r.state, READINESS.INSUFFICIENT_LEVEL);
  assert.equal(r.deciding.need, 100);
  assert.equal(r.deciding.have, 80);
});

test("uncap below requirement -> Insufficient uncap", () => {
  const r = computeReadiness({ level: 100, uncap: 3 }, { requiredLevel: 100, requiredUncap: 5 });
  assert.equal(r.state, READINESS.INSUFFICIENT_UNCAP);
});

test("skill level below requirement -> Insufficient skill level", () => {
  const r = computeReadiness({ level: 100, uncap: 5, skillLevel: 10 }, { requiredSkillLevel: 15 });
  assert.equal(r.state, READINESS.INSUFFICIENT_SKILL_LEVEL);
});

test("wrong awakening path -> Incorrect awakening", () => {
  const r = computeReadiness({ awakening: 1 }, { requiredAwakening: 4 });
  assert.equal(r.state, READINESS.INCORRECT_AWAKENING);
});

test("owned but insufficient quantity -> Duplicate required", () => {
  const r = computeReadiness({ quantity: 1 }, { requiredQuantity: 3 });
  assert.equal(r.state, READINESS.DUPLICATE_REQUIRED);
  assert.equal(r.deciding.need, 3);
  assert.equal(r.deciding.have, 1);
});

test("equipped elsewhere when a free slot is required", () => {
  const r = computeReadiness({ equipped: true }, { requiresFreeSlot: true });
  assert.equal(r.state, READINESS.EQUIPPED_ELSEWHERE);
});

test("limited resource missing -> Limited resource required", () => {
  const r = computeReadiness({ limitedResources: [] }, { requiredLimitedResource: "gold_bar" });
  assert.equal(r.state, READINESS.LIMITED_RESOURCE_REQUIRED);
});

test("multiple gaps are all returned; deciding is the first in check order", () => {
  const item = { level: 80, uncap: 3, skillLevel: 5, awakening: 1, quantity: 1 };
  const req = { requiredLevel: 100, requiredUncap: 5, requiredSkillLevel: 15, requiredAwakening: 4, requiredQuantity: 2 };
  const r = computeReadiness(item, req);
  assert.equal(r.state, READINESS.INSUFFICIENT_LEVEL);
  assert.equal(r.gaps.length, 5);
});

test("no requirement dimension set -> Ready now trivially", () => {
  const r = computeReadiness({ level: 1 }, {});
  assert.equal(r.state, READINESS.READY_NOW);
});
