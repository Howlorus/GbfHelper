import { test } from "node:test";
import assert from "node:assert/strict";
import { wrapEnvelope, assertEnvelope, REQUIRED_ENVELOPE_KEYS } from "../src/lib/envelope.js";

test("wrapEnvelope stamps required §42 fields with sensible defaults", () => {
  const e = wrapEnvelope({ id: 1, name: "a" }, { now: 100, extensionVersion: "0.1.0" });
  assert.equal(e.id, 1);
  assert.equal(e.name, "a");
  assert.equal(e.schemaVersion, 1);
  assert.equal(e.extensionVersion, "0.1.0");
  assert.equal(e.createdAt, 100);
  assert.equal(e.updatedAt, 100);
});

test("wrapEnvelope preserves createdAt on updates (previous record's timestamp wins)", () => {
  const e = wrapEnvelope({ id: 1, name: "a" }, { now: 200, previous: { createdAt: 50, updatedAt: 60 } });
  assert.equal(e.createdAt, 50);
  assert.equal(e.updatedAt, 200);
});

test("wrapEnvelope rejects a record without id", () => {
  assert.throws(() => wrapEnvelope({ name: "a" }), /record\.id/);
});

test("assertEnvelope names the missing required field", () => {
  for (const k of REQUIRED_ENVELOPE_KEYS) {
    const bad = wrapEnvelope({ id: 1 }, { now: 100 });
    delete bad[k];
    assert.throws(() => assertEnvelope(bad), new RegExp(`'${k}' is required`));
  }
});
