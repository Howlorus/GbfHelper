import { test } from "node:test";
import assert from "node:assert/strict";
import { wrapEnvelope, assertEnvelope, needsMigration, REQUIRED_ENVELOPE_KEYS } from "../src/lib/envelope.js";

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
  const previous = { createdAt: 50, updatedAt: 60 };
  const e = wrapEnvelope({ id: 1, name: "a" }, { now: 200, previous });
  assert.equal(e.createdAt, 50);
  assert.equal(e.updatedAt, 200);
});

test("wrapEnvelope rejects a record without id", () => {
  assert.throws(() => wrapEnvelope({ name: "a" }), /record\.id/);
});

test("assertEnvelope passes on a fully-populated record", () => {
  const e = wrapEnvelope({ id: 1 }, { now: 100 });
  assert.equal(assertEnvelope(e), true);
});

test("assertEnvelope names the missing required field", () => {
  for (const k of REQUIRED_ENVELOPE_KEYS) {
    const bad = wrapEnvelope({ id: 1 }, { now: 100 });
    delete bad[k];
    assert.throws(() => assertEnvelope(bad), new RegExp(`'${k}' is required`));
  }
});

test("needsMigration returns true when schemaVersion differs from target", () => {
  const v1 = wrapEnvelope({ id: 1 }, { schemaVersion: 1, now: 1 });
  assert.equal(needsMigration(v1, 2), true);
  assert.equal(needsMigration(v1, 1), false);
});

test("provenance / status / contentHash carry through when provided", () => {
  const e = wrapEnvelope({ id: 1 }, { now: 1, provenance: "account-scan:2026-08-11", status: "archived", contentHash: "sha256:abc" });
  assert.equal(e.provenance, "account-scan:2026-08-11");
  assert.equal(e.status, "archived");
  assert.equal(e.contentHash, "sha256:abc");
});
