// Backup / restore (§35). Backup dumps selected stores as one JSON bundle
// with a schema version. Restore validates the bundle, then writes each
// record back into its store — inside a transaction spanning all target
// stores so a partial failure rolls the whole restore back.

import { storesByTier, TIER } from "./tiers.js";
import { STORE_NAMES } from "../stores.js";
import { assertEnvelope } from "../envelope.js";

export const BACKUP_SCHEMA_VERSION = 1;

// Categories exportable to an anonymized backup. Excludes rebuildable
// caches (would just bloat the backup) and diagnostics (may contain
// account-derived debug strings).
const DEFAULT_BACKUP_STORES = () => [
  ...storesByTier(TIER.CRITICAL),
  ...storesByTier(TIER.CONFIGURABLE),
].filter((s) => s !== "diagnostics");

export async function buildBackup(repo, { stores = DEFAULT_BACKUP_STORES(), now = Date.now(), extensionVersion = "0.0.0" } = {}) {
  const contents = {};
  for (const store of stores) {
    try { contents[store] = await repo.list(store); }
    catch (err) { contents[store] = { error: String(err?.message || err) }; }
  }
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    extensionVersion,
    createdAt: now,
    stores,
    contents,
  };
}

// Restore validates the bundle shape, then writes every record in a
// single transaction over the target stores. Any invalid record (missing
// envelope) aborts the whole restore.
export async function restoreBackup(repo, bundle, { replace = false } = {}) {
  if (!bundle || typeof bundle !== "object") return { ok: false, error: "bundle must be an object" };
  if (bundle.schemaVersion !== BACKUP_SCHEMA_VERSION) return { ok: false, error: `unsupported schemaVersion: ${bundle.schemaVersion}` };
  if (!Array.isArray(bundle.stores) || typeof bundle.contents !== "object") return { ok: false, error: "malformed bundle" };

  const unknown = bundle.stores.filter((s) => !STORE_NAMES.includes(s));
  if (unknown.length) return { ok: false, error: `unknown store(s): ${unknown.join(", ")}` };

  // Validate every record has an envelope BEFORE we open the transaction.
  for (const store of bundle.stores) {
    const rows = bundle.contents[store];
    if (!Array.isArray(rows)) return { ok: false, error: `${store}: expected an array of records` };
    for (const rec of rows) {
      try { assertEnvelope(rec); }
      catch (err) { return { ok: false, error: `${store}: ${err.message}` }; }
    }
  }

  try {
    await repo.transaction(bundle.stores, async (tx) => {
      for (const store of bundle.stores) {
        if (replace) {
          const existing = await tx.list(store);
          for (const rec of existing) await tx.delete(store, rec.id);
        }
        for (const rec of bundle.contents[store]) await tx.put(store, rec);
      }
    });
    return { ok: true, restoredStores: bundle.stores };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}
