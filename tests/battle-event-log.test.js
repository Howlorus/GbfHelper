import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEvent, appendEvent, EVENT_LOG_CAP } from "../src/lib/battle/event-log.js";
import { finalizeRun } from "../src/lib/battle/session.js";

test("buildEvent normalizes an unknown kind to 'unknown'", () => {
  const e = buildEvent("bogus", { ts: 100 });
  assert.equal(e.kind, "unknown");
  assert.equal(e.ts, 100);
});

test("buildEvent copies the payload defensively (no external mutation)", () => {
  const p = { damage: 42 };
  const e = buildEvent("attack", { payload: p });
  p.damage = 999;
  assert.equal(e.payload.damage, 42);
});

test("appendEvent returns a new array (pure)", () => {
  const log = [];
  const next = appendEvent(log, buildEvent("attack"));
  assert.equal(log.length, 0);
  assert.equal(next.length, 1);
});

test("appendEvent respects the in-memory cap", () => {
  let log = [];
  // Cheat the cap for the test:
  const CAP = EVENT_LOG_CAP;
  for (let i = 0; i < CAP; i++) log.push({ ts: i, kind: "attack" });
  const stillCap = appendEvent(log, buildEvent("attack"));
  assert.equal(stillCap.length, CAP);
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
