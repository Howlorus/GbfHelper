import { test } from "node:test";
import assert from "node:assert/strict";
import { CaptureRegistry } from "../src/lib/capture-registry.js";

test("empty registry: size 0, detachAll no-op", async () => {
  const r = new CaptureRegistry();
  assert.equal(r.size, 0);
  const { results } = await r.detachAll();
  assert.deepEqual(results, []);
});

test("register / has / unregister", () => {
  const r = new CaptureRegistry();
  r.register("adapter-a", () => {});
  assert.equal(r.size, 1);
  assert.equal(r.has("adapter-a"), true);
  assert.equal(r.unregister("adapter-a"), true);
  assert.equal(r.size, 0);
  assert.equal(r.unregister("adapter-a"), false);
});

test("register rejects invalid arguments", () => {
  const r = new CaptureRegistry();
  assert.throws(() => r.register("", () => {}), /non-empty string/);
  assert.throws(() => r.register(null, () => {}), /non-empty string/);
  assert.throws(() => r.register("id", "not a function"), /must be a function/);
});

test("register refuses duplicate id (adapters must be unique)", () => {
  const r = new CaptureRegistry();
  r.register("a", () => {});
  assert.throws(() => r.register("a", () => {}), /already registered/);
});

test("detachAll invokes every adapter's detach and clears the registry", async () => {
  const r = new CaptureRegistry();
  const calls = [];
  r.register("a", () => { calls.push("a"); });
  r.register("b", async () => { calls.push("b"); });
  const { results } = await r.detachAll();
  assert.deepEqual(calls.sort(), ["a", "b"]);
  assert.equal(r.size, 0);
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.ok));
});

test("failing detach does not prevent siblings from running", async () => {
  const r = new CaptureRegistry();
  const errors = [];
  r.register("bad", () => { throw new Error("boom"); });
  const good = [];
  r.register("good", () => { good.push("ok"); });
  const { results } = await r.detachAll({ onError: (id, err) => errors.push([id, err.message]) });
  assert.deepEqual(good, ["ok"]);
  assert.deepEqual(errors, [["bad", "boom"]]);
  assert.equal(r.size, 0);
  const bad = results.find((r) => r.id === "bad");
  assert.equal(bad.ok, false);
});

test("detachAll completes well within 500ms budget for fast adapters", async () => {
  const r = new CaptureRegistry();
  for (let i = 0; i < 20; i++) r.register(`adapter-${i}`, () => {});
  const { durationMs } = await r.detachAll();
  assert.ok(durationMs < 500, `detachAll took ${durationMs}ms (budget: 500ms)`);
});

test("registry is empty during in-flight detach: no re-entry possible", async () => {
  const r = new CaptureRegistry();
  let sizeSeenDuringDetach = -1;
  let released;
  const barrier = new Promise((resolve) => { released = resolve; });
  r.register("slow", async () => {
    sizeSeenDuringDetach = r.size;
    await barrier;
  });
  const done = r.detachAll();
  // Registry is snapshotted + cleared before awaiting adapters.
  assert.equal(r.size, 0);
  released();
  await done;
  assert.equal(sizeSeenDuringDetach, 0);
});

test("adapters can be re-registered after detachAll", async () => {
  const r = new CaptureRegistry();
  r.register("a", () => {});
  await r.detachAll();
  // Not permanently blocked.
  r.register("a", () => {});
  assert.equal(r.size, 1);
});
