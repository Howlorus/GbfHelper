import { test } from "node:test";
import assert from "node:assert/strict";
import { TIER, tierOf, storesByTier } from "../src/lib/storage/tiers.js";

test("critical tier covers user data protected by default (§35.1)", () => {
  const critical = storesByTier(TIER.CRITICAL);
  for (const must of ["inventory", "raidPlans", "notes", "calibration", "settings", "strategyPacks"]) {
    assert.ok(critical.includes(must), `${must} must be critical`);
  }
});

test("rebuildable tier covers indexes / caches / diagnostics", () => {
  const rebuildable = storesByTier(TIER.REBUILDABLE);
  for (const s of ["searchIndexes", "sourceCache", "diagnostics"]) {
    assert.ok(rebuildable.includes(s), `${s} must be rebuildable`);
  }
});

test("tierOf returns null for unknown stores", () => {
  assert.equal(tierOf("nope"), null);
});
