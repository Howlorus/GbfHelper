import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRaidPlan, validateRaidPlan, RAID_PLAN_STATUSES } from "../src/lib/raid-plan/schema.js";

function goodInput() {
  return { id: "plan-1", raidId: "bahamut-proud", element: "dark", objective: "first-clear" };
}

test("buildRaidPlan fills the §9.1 shape with sensible defaults", () => {
  const p = buildRaidPlan(goodInput());
  assert.equal(p.id, "plan-1");
  assert.equal(p.raidPlanVersion, 1);
  assert.equal(p.status, "draft");
  assert.deepEqual(p.party, []);
  assert.equal(p.mainSummon, null);
  assert.equal(p.changeSource, "user-edit");
});

test("buildRaidPlan preserves user-provided fields verbatim", () => {
  const p = buildRaidPlan({
    ...goodInput(),
    party: ["char.zeta"],
    mainSummon: "summon.bahamut",
    sourceStrategyPackId: "pack-1",
    sourceStrategyPackVersion: "1.0.0",
  });
  assert.deepEqual(p.party, ["char.zeta"]);
  assert.equal(p.mainSummon, "summon.bahamut");
  assert.equal(p.sourceStrategyPackId, "pack-1");
});

test("buildRaidPlan rejects records missing required fields", () => {
  for (const key of ["id", "raidId", "element", "objective"]) {
    const bad = { ...goodInput() };
    delete bad[key];
    assert.throws(() => buildRaidPlan(bad), new RegExp(`\\.${key} required`));
  }
});

test("validateRaidPlan refuses an unknown status", () => {
  const p = buildRaidPlan(goodInput());
  p.status = "haunted";
  assert.throws(() => validateRaidPlan(p), /status/);
});

test("validateRaidPlan refuses a non-positive raidPlanVersion", () => {
  const p = buildRaidPlan(goodInput());
  p.raidPlanVersion = 0;
  assert.throws(() => validateRaidPlan(p), /raidPlanVersion/);
});

test("RAID_PLAN_STATUSES covers the lifecycle states", () => {
  for (const s of ["draft", "current", "variant", "archived"]) {
    assert.ok(RAID_PLAN_STATUSES.includes(s));
  }
});
