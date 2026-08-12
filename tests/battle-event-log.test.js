import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEvent, appendEvent } from "../src/lib/battle/event-log.js";
import { finalizeRun } from "../src/lib/battle/session.js";

test("buildEvent copies the payload defensively (no external mutation)", () => {
  const p = { damage: 42 };
  const e = buildEvent("attack", { payload: p });
  p.damage = 999;
  assert.equal(e.payload.damage, 42);
});

test("appendEvent returns a new array (pure)", () => {
  const next = appendEvent([], buildEvent("attack"));
  assert.equal(next.length, 1);
});

test("finalizeRun packages events + state + provenance", () => {
  const run = finalizeRun({
    sessionId: "s-1",
    raidId: "bahamut-proud",
    startedAt: 100,
    endedAt: 500,
    endReason: "user-stop",
    events: [buildEvent("attack", { turn: 1, ts: 200 })],
    finalState: { turn: 1, stateQuality: "Synchronized" },
  });
  assert.equal(run.id, "run:s-1");
  assert.equal(run.durationMs, 400);
  assert.equal(run.turns, 1);
  assert.equal(run.finalStateQuality, "Synchronized");
  assert.equal(run.eventCount, 1);
});

test("finalizeRun refuses invalid endReason", () => {
  assert.throws(() => finalizeRun({
    sessionId: "s-1", startedAt: 0, endReason: "yolo",
  }), /endReason/);
});

test("finalizeRun refuses without sessionId / startedAt", () => {
  assert.throws(() => finalizeRun({ startedAt: 0, endReason: "user-stop" }), /sessionId/);
  assert.throws(() => finalizeRun({ sessionId: "s-1", endReason: "user-stop" }), /startedAt/);
});
