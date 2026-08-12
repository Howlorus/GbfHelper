import { test } from "node:test";
import assert from "node:assert/strict";
import { evalRules } from "../src/lib/live-coach/rule-engine.js";
import { renderReason, REASON } from "../src/lib/live-coach/reason-catalog.js";
import { estimate } from "../src/lib/live-coach/estimator.js";

const syncedState = (extra = {}) => ({
  stateQuality: "Synchronized", turn: 5, boss: { hp: 400, hpMax: 1000 },
  visibleOmen: { kind: "hit-count" }, ...extra,
});

test("evalRules: state quality != Synchronized -> Suspended", () => {
  const r = evalRules([], { stateQuality: "Stale" });
  assert.equal(r.status, "Suspended");
  assert.match(r.reason, /Guidance suspended/);
});

test("evalRules: null state -> Suspended (defensive)", () => {
  assert.equal(evalRules([], null).status, "Suspended");
});

test("evalRules: no rules loaded -> NoRule", () => {
  assert.equal(evalRules([], syncedState()).status, "NoRule");
});

test("evalRules: no matching rule -> NoMatch", () => {
  const rules = [{ id: "r1", when: [{ path: "turn", op: "gte", value: 100 }], action: "DISPEL_NOW" }];
  assert.equal(evalRules(rules, syncedState()).status, "NoMatch");
});

test("evalRules: matching rule -> Recommendation with §32 payload", () => {
  const rules = [{
    id: "r.dispel", priority: 3, confidence: "Likely", source: "pack#v1",
    when: [{ path: "visibleOmen.kind", op: "eq", value: "hit-count" }, { path: "turn", op: "gte", value: 3 }],
    action: "DISPEL_NOW",
  }];
  const r = evalRules(rules, syncedState());
  assert.equal(r.status, "Recommendation");
  assert.equal(r.ruleId, "r.dispel");
  assert.equal(r.action, "DISPEL_NOW");
  assert.equal(r.reason, REASON.DISPEL_NOW);
  assert.equal(r.confidence, "Likely");
  assert.equal(r.source, "pack#v1");
  assert.equal(r.evidence.length, 2);
});

test("evalRules: highest priority wins on ties broken by ruleId", () => {
  const rules = [
    { id: "a", priority: 2, action: "DISPEL_NOW", when: [{ path: "turn", op: "gte", value: 1 }] },
    { id: "b", priority: 3, action: "GUARD_INCOMING", when: [{ path: "turn", op: "gte", value: 1 }] },
    { id: "c", priority: 3, action: "FULL_CHAIN_READY", when: [{ path: "turn", op: "gte", value: 1 }] },
  ];
  const r = evalRules(rules, syncedState());
  assert.equal(r.ruleId, "b");
});

test("evalRules refuses rules with unknown op (never runs eval'd code)", () => {
  const rules = [{ id: "r", when: [{ path: "turn", op: "javascript", value: "alert(1)" }], action: "DISPEL_NOW" }];
  assert.equal(evalRules(rules, syncedState()).status, "NoMatch");
});

test("renderReason returns the bounded string; unknown keys return null", () => {
  assert.equal(renderReason("DISPEL_NOW"), REASON.DISPEL_NOW);
  assert.equal(renderReason("MADE_UP_KEY"), null);
});

test("estimator always returns InsufficientData until E08 lands", () => {
  assert.equal(estimate({ target: "boss" }).assessment, "InsufficientData");
  assert.equal(estimate({ target: "boss" }, { some: "data" }).assessment, "InsufficientData");
});
