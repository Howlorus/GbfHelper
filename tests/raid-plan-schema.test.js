import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRaidPlan, validateRaidPlan, storageId } from "../src/lib/raid-plan/schema.js";

function goodInput() {
  return { planId: "plan-1", raidId: "bahamut-proud", element: "dark", objective: "first-clear" };
}

test("buildRaidPlan constructs storage id from planId + version, fills defaults", () => {
  const p = buildRaidPlan(goodInput());
  assert.equal(p.id, "plan-1@v1");
  assert.equal(p.planId, "plan-1");
  assert.equal(p.raidPlanVersion, 1);
  assert.equal(p.status, "current");
  assert.deepEqual(p.party, []);
  assert.equal(p.changeSource, "user-edit");
});

test("buildRaidPlan honors raidPlanVersion when provided", () => {
  assert.equal(buildRaidPlan({ ...goodInput(), raidPlanVersion: 4 }).id, "plan-1@v4");
});

test("buildRaidPlan preserves user-provided domain fields", () => {
  const p = buildRaidPlan({ ...goodInput(), party: ["char.zeta"], mainSummon: "summon.bahamut" });
  assert.deepEqual(p.party, ["char.zeta"]);
  assert.equal(p.mainSummon, "summon.bahamut");
});

test("buildRaidPlan refuses without planId", () => {
  assert.throws(() => buildRaidPlan({ raidId: "x", element: "y", objective: "z" }), /planId required/);
});

test("validateRaidPlan refuses an unknown status", () => {
  const p = buildRaidPlan(goodInput()); p.status = "haunted";
  assert.throws(() => validateRaidPlan(p), /status/);
});

test("storageId formats planId + version", () => {
  assert.equal(storageId("plan-1", 3), "plan-1@v3");
});
