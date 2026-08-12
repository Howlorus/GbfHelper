import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInitialBattleState, applyEvent, computeStateQuality, STATE_QUALITY } from "../src/lib/battle/state-model.js";

test("initial state has PartiallySynchronized quality (nothing observed yet)", () => {
  const s = buildInitialBattleState({ now: 100 });
  assert.equal(s.stateQuality, STATE_QUALITY.PARTIALLY_SYNCHRONIZED);
  assert.equal(s.turn, null);
});

test("applyEvent fills in turn / boss and drives state to Synchronized", () => {
  const s0 = buildInitialBattleState({ now: 100 });
  const s1 = applyEvent(s0, { turn: 1, boss: { id: "bp", hp: 900, hpMax: 1000 } }, { now: 200 });
  assert.equal(s1.turn, 1);
  assert.equal(s1.boss.hp, 900);
  assert.equal(s1.stateQuality, STATE_QUALITY.SYNCHRONIZED);
});

test("computeStateQuality: hp > hpMax -> Conflicting", () => {
  const s = { ...buildInitialBattleState(), turn: 1, boss: { hp: 1500, hpMax: 1000 } };
  assert.equal(computeStateQuality(s), STATE_QUALITY.CONFLICTING);
});

test("computeStateQuality: stale timestamp -> Stale", () => {
  const s = { turn: 1, boss: { hp: 100, hpMax: 100 }, lastObservedAt: 0 };
  assert.equal(computeStateQuality(s, { now: 10000, staleAfterMs: 5000 }), STATE_QUALITY.STALE);
});

test("applyEvent is pure — input state is not mutated", () => {
  const s0 = buildInitialBattleState({ now: 100 });
  const before = JSON.stringify(s0);
  applyEvent(s0, { turn: 1 });
  assert.equal(JSON.stringify(s0), before);
});
