import { test } from "node:test";
import assert from "node:assert/strict";
import { diffPlans } from "../src/lib/raid-plan/compare.js";
import { buildRaidPlan } from "../src/lib/raid-plan/schema.js";

function base() {
  return buildRaidPlan({ planId: "p1", raidId: "bp", element: "dark", objective: "first-clear" });
}

test("identical plans -> identical=true, no changed fields", () => {
  const a = base(); const b = base();
  const d = diffPlans(a, b);
  assert.equal(d.identical, true);
  assert.equal(d.changedCount, 0);
});

test("scalar field difference is captured with both values", () => {
  const a = base(); const b = { ...base(), objective: "safe-solo" };
  const d = diffPlans(a, b);
  assert.equal(d.identical, false);
  assert.equal(d.changedCount, 1);
  assert.deepEqual(d.fields.objective, { same: false, a: "first-clear", b: "safe-solo" });
});

test("array field difference is captured (order matters)", () => {
  const a = { ...base(), party: ["char.zeta"] };
  const b = { ...base(), party: ["char.zeta", "char.vane"] };
  const d = diffPlans(a, b);
  assert.equal(d.fields.party.same, false);
  assert.deepEqual(d.fields.party.a, ["char.zeta"]);
  assert.deepEqual(d.fields.party.b, ["char.zeta", "char.vane"]);
});

test("deep-equal arrays with same content are reported same", () => {
  const a = { ...base(), party: ["char.zeta"] };
  const b = { ...base(), party: ["char.zeta"] };
  const d = diffPlans(a, b);
  assert.equal(d.fields.party.same, true);
});

test("null-vs-missing treated equal (both nullable)", () => {
  const a = { ...base(), mainSummon: null };
  const b = { ...base() };
  delete b.mainSummon;
  const d = diffPlans(a, b);
  assert.equal(d.fields.mainSummon.same, true);
});

