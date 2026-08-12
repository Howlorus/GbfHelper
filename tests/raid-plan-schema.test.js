import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRaidPlan, validateRaidPlan, storageId, parseStorageId, RAID_PLAN_STATUSES } from "../src/lib/raid-plan/schema.js";

function goodInput() {
  return { planId: "plan-1", raidId: "bahamut-proud", element: "dark", objective: "first-clear" };
}

test("buildRaidPlan constructs storage id from planId + version, fills §9.1 defaults", () => {
  const p = buildRaidPlan(goodInput());
  assert.equal(p.id, "plan-1@v1");
  assert.equal(p.planId, "plan-1");
  assert.equal(p.raidPlanVersion, 1);
  assert.equal(p.status, "current");
  assert.deepEqual(p.party, []);
  assert.equal(p.changeSource, "user-edit");
});

test("buildRaidPlan honors raidPlanVersion when provided", () => {
  const p = buildRaidPlan({ ...goodInput(), raidPlanVersion: 4 });
  assert.equal(p.id, "plan-1@v4");
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

test("storageId + parseStorageId round-trip", () => {
  assert.equal(storageId("plan-1", 3), "plan-1@v3");
  assert.deepEqual(parseStorageId("plan-1@v3"), { planId: "plan-1", version: 3 });
  assert.equal(parseStorageId("not-versioned"), null);
});

test("RAID_PLAN_STATUSES covers the lifecycle states", () => {
  for (const s of ["draft", "current", "variant", "archived"]) {
    assert.ok(RAID_PLAN_STATUSES.includes(s));
  }
});
