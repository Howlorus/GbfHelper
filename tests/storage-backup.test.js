import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryRepository } from "../src/lib/repositories/in-memory.js";
import { STORE_NAMES } from "../src/lib/stores.js";
import { wrapWithValidation } from "../src/lib/corruption.js";
import { wrapEnvelope } from "../src/lib/envelope.js";
import { buildBackup, restoreBackup, BACKUP_SCHEMA_VERSION } from "../src/lib/storage/backup.js";

function newRepo() { return wrapWithValidation(new InMemoryRepository(STORE_NAMES)); }

test("buildBackup snapshots the requested stores + carries schema version", async () => {
  const r = newRepo();
  await r.put("inventory", wrapEnvelope({ id: "current", data: 42 }, { now: 100 }));
  const bundle = await buildBackup(r, { stores: ["inventory"], now: 200, extensionVersion: "0.1.0" });
  assert.equal(bundle.schemaVersion, BACKUP_SCHEMA_VERSION);
  assert.equal(bundle.createdAt, 200);
  assert.equal(bundle.contents.inventory.length, 1);
  assert.equal(bundle.contents.inventory[0].data, 42);
});

test("restoreBackup rejects an unknown schema version", async () => {
  const r = newRepo();
  const res = await restoreBackup(r, { schemaVersion: 99, stores: [], contents: {} });
  assert.equal(res.ok, false);
  assert.match(res.error, /schemaVersion/);
});

test("restoreBackup rejects a bundle referencing unknown stores", async () => {
  const r = newRepo();
  const res = await restoreBackup(r, { schemaVersion: BACKUP_SCHEMA_VERSION, stores: ["payments"], contents: { payments: [] } });
  assert.equal(res.ok, false);
  assert.match(res.error, /unknown store/);
});

test("restoreBackup refuses any envelope-less record (transaction never opens)", async () => {
  const r = newRepo();
  const res = await restoreBackup(r, {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    stores: ["inventory"],
    contents: { inventory: [{ id: "x" }] }, // no envelope
  });
  assert.equal(res.ok, false);
  assert.match(res.error, /schemaVersion|updatedAt|createdAt|extensionVersion/);
  assert.equal((await r.list("inventory")).length, 0, "nothing was written");
});

test("restore round-trip: build a backup, restore into a fresh repo, contents match", async () => {
  const a = newRepo(); const b = newRepo();
  await a.put("inventory", wrapEnvelope({ id: "current", data: 1 }, { now: 100 }));
  await a.put("raidPlans", wrapEnvelope({ id: "plan-1@v1", data: 2 }, { now: 100 }));
  const bundle = await buildBackup(a, { stores: ["inventory", "raidPlans"], now: 200 });
  const res = await restoreBackup(b, bundle);
  assert.equal(res.ok, true);
  assert.equal((await b.get("inventory", "current")).data, 1);
  assert.equal((await b.get("raidPlans", "plan-1@v1")).data, 2);
});

test("restore with replace:true clears the target store first", async () => {
  const r = newRepo();
  await r.put("notes", wrapEnvelope({ id: "old", text: "old" }, { now: 100 }));
  const bundle = {
    schemaVersion: BACKUP_SCHEMA_VERSION, stores: ["notes"],
    contents: { notes: [wrapEnvelope({ id: "new", text: "new" }, { now: 200 })] },
  };
  await restoreBackup(r, bundle, { replace: true });
  const rows = await r.list("notes");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "new");
});
