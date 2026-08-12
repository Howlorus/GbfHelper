import { test } from "node:test";
import assert from "node:assert/strict";
import { STORE_NAMES } from "../src/lib/stores.js";
import { InMemoryRepository } from "../src/lib/repositories/in-memory.js";

test("§7.6 categories are all declared", () => {
  for (const s of ["gameData", "strategyPacks", "terminologyPacks", "inventory", "raidPlans", "notes", "runHistory", "calibration", "searchIndexes", "sourceCache", "settings", "diagnostics"]) {
    assert.ok(STORE_NAMES.includes(s), `missing store ${s}`);
  }
});

test("Repository built with STORE_NAMES refuses cross-category writes", async () => {
  const r = new InMemoryRepository(STORE_NAMES);
  await r.put("inventory", { id: 1, name: "test" });
  await assert.rejects(() => r.put("payments", { id: 1 }), /unknown store/);
});
