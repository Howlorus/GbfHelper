import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256Hex, verifyChecksums, prepareInstall, installPack } from "../src/lib/packs/install.js";
import { wrapEnvelope } from "../src/lib/envelope.js";
import { InMemoryRepository } from "../src/lib/repositories/in-memory.js";
import { STORE_NAMES } from "../src/lib/stores.js";

async function goodRawFiles() {
  const raid = JSON.stringify({ id: "bahamut-proud" });
  const strategies = "[]";
  const rotations = "[]";
  const substitutions = "[]";
  const rules = "[]";
  const sources = "[]";
  const migrations = "[]";
  const manifest = JSON.stringify({ id: "gbf.bp.dark", name: "BP Dark", version: "1.0.0", kind: "strategy", schemaVersion: 1 });
  const checksums = JSON.stringify({
    "raid.json": await sha256Hex(raid),
    "strategies.json": await sha256Hex(strategies),
    "rotations.json": await sha256Hex(rotations),
    "substitutions.json": await sha256Hex(substitutions),
    "rules.json": await sha256Hex(rules),
    "sources.json": await sha256Hex(sources),
    "migrations.json": await sha256Hex(migrations),
  });
  return {
    "manifest.json": manifest, "checksums.json": checksums,
    "raid.json": raid, "strategies.json": strategies, "rotations.json": rotations,
    "substitutions.json": substitutions, "rules.json": rules, "sources.json": sources,
    "migrations.json": migrations,
  };
}

test("sha256Hex produces a 64-char hex string", async () => {
  const hex = await sha256Hex("hello");
  assert.equal(hex.length, 64);
  assert.match(hex, /^[a-f0-9]{64}$/);
});

test("verifyChecksums accepts a matching set", async () => {
  const files = { "a.json": "1", "b.json": "2" };
  const checksums = { "a.json": await sha256Hex("1"), "b.json": await sha256Hex("2") };
  const errs = await verifyChecksums(files, checksums);
  assert.deepEqual(errs, []);
});

test("verifyChecksums detects a mismatch and a missing file", async () => {
  const files = { "a.json": "tampered" };
  const checksums = { "a.json": await sha256Hex("original"), "missing.json": await sha256Hex("x") };
  const errs = await verifyChecksums(files, checksums);
  assert.equal(errs.length, 2);
  assert.ok(errs.some((e) => e.includes("checksum mismatch")));
  assert.ok(errs.some((e) => e.includes("missing file")));
});

test("prepareInstall: well-formed strategy pack is accepted", async () => {
  const raw = await goodRawFiles();
  const r = await prepareInstall(raw);
  assert.equal(r.ok, true);
  assert.equal(r.bundle["manifest.json"].id, "gbf.bp.dark");
});

test("prepareInstall: invalid JSON in any file is refused with a per-file error", async () => {
  const raw = await goodRawFiles();
  raw["raid.json"] = "{ not json";
  const r = await prepareInstall(raw);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.startsWith("raid.json:")));
});

test("prepareInstall: tampered file content is caught by checksum verification", async () => {
  const raw = await goodRawFiles();
  raw["strategies.json"] = '[{"tampered": true}]';
  const r = await prepareInstall(raw);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("checksum mismatch: strategies.json")));
});

test("installPack: writes to strategyPacks store transactionally", async () => {
  const repo = new InMemoryRepository(STORE_NAMES);
  const raw = await goodRawFiles();
  const prepared = await prepareInstall(raw);
  await installPack(repo, prepared.bundle, { wrapEnvelope, now: 100, extensionVersion: "0.1.0" });
  const list = await repo.list("strategyPacks");
  assert.equal(list.length, 1);
  assert.equal(list[0].id, "gbf.bp.dark");
  assert.equal(list[0].active, true);
});
