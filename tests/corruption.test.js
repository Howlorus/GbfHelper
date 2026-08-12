import { test } from "node:test";
import assert from "node:assert/strict";
import { CorruptionError, validateEnvelope, computeContentHash, wrapWithValidation } from "../src/lib/corruption.js";
import { wrapEnvelope } from "../src/lib/envelope.js";
import { InMemoryRepository } from "../src/lib/repositories/in-memory.js";

test("validateEnvelope: ok on a fully-wrapped record", () => {
  const r = wrapEnvelope({ id: 1 }, { now: 100 });
  assert.deepEqual(validateEnvelope(r), { ok: true });
});

test("validateEnvelope: names the missing envelope field", () => {
  const r = wrapEnvelope({ id: 1 }, { now: 100 });
  delete r.schemaVersion;
  const v = validateEnvelope(r);
  assert.equal(v.ok, false);
  assert.match(v.error, /schemaVersion/);
});

test("wrapped repository: get() throws CorruptionError on a bad envelope", async () => {
  const base = new InMemoryRepository(["a"]);
  await base.put("a", { id: 1, name: "broken", schemaVersion: null }); // envelope corrupt
  const wrapped = wrapWithValidation(base);
  await assert.rejects(() => wrapped.get("a", 1), CorruptionError);
});

test("wrapped repository: list() throws on the first corrupt record", async () => {
  const base = new InMemoryRepository(["a"]);
  await base.put("a", wrapEnvelope({ id: 1, name: "ok" }, { now: 1 }));
  await base.put("a", { id: 2, name: "broken" }); // no envelope
  const wrapped = wrapWithValidation(base);
  await assert.rejects(() => wrapped.list("a"), CorruptionError);
});

test("get / put on a valid record round-trips through the validation wrapper", async () => {
  const base = new InMemoryRepository(["a"]);
  const wrapped = wrapWithValidation(base);
  const rec = wrapEnvelope({ id: 1, name: "ok" }, { now: 1 });
  await wrapped.put("a", rec);
  const got = await wrapped.get("a", 1);
  assert.equal(got.name, "ok");
});

test("computeContentHash is stable across ignored timestamp changes", async () => {
  const a = wrapEnvelope({ id: 1, name: "same" }, { now: 100 });
  const b = wrapEnvelope({ id: 1, name: "same" }, { now: 200 });
  const ha = await computeContentHash(a);
  const hb = await computeContentHash(b);
  assert.equal(ha, hb);
});

test("computeContentHash changes when the payload changes", async () => {
  const a = wrapEnvelope({ id: 1, name: "one" }, { now: 100 });
  const b = wrapEnvelope({ id: 1, name: "two" }, { now: 100 });
  assert.notEqual(await computeContentHash(a), await computeContentHash(b));
});

test("wrapped repository with a hasher: content-hash mismatch throws CorruptionError", async () => {
  const base = new InMemoryRepository(["a"]);
  const rec = wrapEnvelope({ id: 1, name: "orig" }, { now: 1 });
  rec.contentHash = await computeContentHash(rec);
  // Tamper the record content but keep the (now-stale) hash.
  rec.name = "tampered";
  await base.put("a", rec);
  const wrapped = wrapWithValidation(base, { hasher: computeContentHash });
  await assert.rejects(() => wrapped.get("a", 1), /content hash mismatch/);
});

test("wrapped repository with a hasher: matching hash passes through", async () => {
  const base = new InMemoryRepository(["a"]);
  const rec = wrapEnvelope({ id: 1, name: "orig" }, { now: 1 });
  rec.contentHash = await computeContentHash(rec);
  await base.put("a", rec);
  const wrapped = wrapWithValidation(base, { hasher: computeContentHash });
  const got = await wrapped.get("a", 1);
  assert.equal(got.name, "orig");
});
