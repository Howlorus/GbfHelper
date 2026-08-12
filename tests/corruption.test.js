import { test } from "node:test";
import assert from "node:assert/strict";
import { CorruptionError, wrapWithValidation } from "../src/lib/corruption.js";
import { wrapEnvelope } from "../src/lib/envelope.js";
import { InMemoryRepository } from "../src/lib/repositories/in-memory.js";

test("wrapped get throws CorruptionError when the envelope is broken", async () => {
  const base = new InMemoryRepository(["a"]);
  await base.put("a", { id: 1, name: "broken" }); // no envelope
  const wrapped = wrapWithValidation(base);
  await assert.rejects(() => wrapped.get("a", 1), CorruptionError);
});

test("wrapped list throws on the first corrupt record (§7.5, no silent continue)", async () => {
  const base = new InMemoryRepository(["a"]);
  await base.put("a", wrapEnvelope({ id: 1, name: "ok" }, { now: 1 }));
  await base.put("a", { id: 2, name: "broken" });
  const wrapped = wrapWithValidation(base);
  await assert.rejects(() => wrapped.list("a"), CorruptionError);
});

test("wrapped put rejects an envelope-less record (write-side enforcement)", async () => {
  const base = new InMemoryRepository(["a"]);
  const wrapped = wrapWithValidation(base);
  await assert.rejects(() => wrapped.put("a", { id: 1, name: "no envelope" }), CorruptionError);
  // Base store must still be empty.
  assert.equal((await base.list("a")).length, 0);
});

test("get / put on a properly-wrapped record round-trips through the validation wrapper", async () => {
  const base = new InMemoryRepository(["a"]);
  const wrapped = wrapWithValidation(base);
  await wrapped.put("a", wrapEnvelope({ id: 1, name: "ok" }, { now: 1 }));
  const got = await wrapped.get("a", 1);
  assert.equal(got.name, "ok");
});

test("CorruptionError carries store + id for consumer routing", async () => {
  const base = new InMemoryRepository(["a"]);
  await base.put("a", { id: 42, name: "corrupt" });
  const wrapped = wrapWithValidation(base);
  try { await wrapped.get("a", 42); assert.fail("should throw"); }
  catch (err) {
    assert.ok(err instanceof CorruptionError);
    assert.equal(err.store, "a");
    assert.equal(err.id, 42);
  }
});
