import { test } from "node:test";
import assert from "node:assert/strict";
import { STORE_NAMES, STORE_TIERS, STORES, storesByTier } from "../src/lib/stores.js";
import { InMemoryRepository } from "../src/lib/repositories/in-memory.js";

test("§7.6 categories are all declared", () => {
  const expected = ["gameData", "strategyPacks", "terminologyPacks", "inventory", "raidPlans", "notes", "runHistory", "calibration", "searchIndexes", "sourceCache", "settings", "diagnostics"];
  for (const s of expected) assert.ok(STORE_NAMES.includes(s), `missing store ${s}`);
});

test("critical tier covers user data protected by default (§35.1)", () => {
  const critical = storesByTier(STORE_TIERS.CRITICAL);
  for (const must of ["inventory", "raidPlans", "notes", "calibration", "settings"]) {
    assert.ok(critical.includes(must), `${must} must be critical`);
  }
});

test("rebuildable tier covers indexes / caches / diagnostics (safe to Quick Cleanup)", () => {
  const rebuildable = storesByTier(STORE_TIERS.REBUILDABLE);
  for (const s of ["searchIndexes", "sourceCache", "diagnostics"]) {
    assert.ok(rebuildable.includes(s), `${s} must be rebuildable`);
  }
});

test("every store carries a tier (no orphan declarations)", () => {
  for (const name of STORE_NAMES) {
    assert.ok(Object.values(STORE_TIERS).includes(STORES[name].tier), `${name} tier invalid`);
  }
});

test("Repository built with STORE_NAMES refuses cross-category writes", async () => {
  const r = new InMemoryRepository(STORE_NAMES);
  await r.put("inventory", { id: 1, name: "test" });
  await assert.rejects(() => r.put("payments", { id: 1 }), /unknown store/);
  await assert.rejects(() => r.get("does-not-exist", 1), /unknown store/);
});
