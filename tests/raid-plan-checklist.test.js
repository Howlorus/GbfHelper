import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChecklist } from "../src/lib/raid-plan/checklist.js";

const emptyPlan = { party: [], grid: [], subSummons: [] };

test("empty plan + no inventory -> everything Unverified or NotObservable", () => {
  const items = buildChecklist(emptyPlan, {});
  for (const it of items) {
    assert.ok(["Unverified", "NotObservable"].includes(it.state), `bad state ${it.state}`);
  }
});

test("owned party members render ConfirmedAutomatically; missing ones Incorrect", () => {
  const plan = { ...emptyPlan, party: ["char.zeta", "char.vane"] };
  const inv = { characters: [{ id: "char.zeta" }] };
  const items = buildChecklist(plan, inv);
  const zeta = items.find((i) => i.label.includes("char.zeta"));
  const vane = items.find((i) => i.label.includes("char.vane"));
  assert.equal(zeta.state, "ConfirmedAutomatically");
  assert.equal(vane.state, "Incorrect");
});

test("owned grid weapons render ConfirmedAutomatically; missing ones Incorrect", () => {
  const plan = { ...emptyPlan, grid: ["wpn.excal", "wpn.spear"] };
  const inv = { weapons: [{ id: "wpn.excal" }] };
  const items = buildChecklist(plan, inv);
  assert.equal(items.find((i) => i.label.includes("wpn.excal")).state, "ConfirmedAutomatically");
  assert.equal(items.find((i) => i.label.includes("wpn.spear")).state, "Incorrect");
});

test("main summon: owned -> Confirmed, missing -> Incorrect, absent -> Unverified", () => {
  const owned = buildChecklist({ ...emptyPlan, mainSummon: "s1" }, { summons: [{ id: "s1" }] });
  const missing = buildChecklist({ ...emptyPlan, mainSummon: "s1" }, { summons: [] });
  const absent = buildChecklist(emptyPlan, {});
  assert.equal(owned.find((i) => i.label.startsWith("Main summon")).state, "ConfirmedAutomatically");
  assert.equal(missing.find((i) => i.label.startsWith("Main summon")).state, "Incorrect");
  assert.equal(absent.find((i) => i.label.startsWith("Main summon")).state, "Unverified");
});

test("support summon + raid bonus are always NotObservable", () => {
  const items = buildChecklist(emptyPlan, {});
  assert.equal(items.find((i) => i.label === "Support summon").state, "NotObservable");
  assert.equal(items.find((i) => i.label === "Raid bonus").state, "NotObservable");
});

