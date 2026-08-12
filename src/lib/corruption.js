// Corruption detection layer over any Repository. Every read is validated
// against the §42 envelope shape and (optionally) a content-hash. Failure
// surfaces via CorruptionError — never a silent skip (§7.5).

import { assertEnvelope } from "./envelope.js";

export class CorruptionError extends Error {
  constructor(message, { store, id } = {}) {
    super(message);
    this.name = "CorruptionError";
    this.store = store;
    this.id = id;
  }
}

export function validateEnvelope(record) {
  try {
    assertEnvelope(record);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Compute a stable SHA-256 hex digest of the record's non-envelope content.
// Excluding updatedAt / createdAt / contentHash means routine timestamp
// changes do not invalidate the hash of the payload itself.
export async function computeContentHash(record) {
  const { contentHash, updatedAt, createdAt, ...rest } = record;
  const canonical = JSON.stringify(rest);
  const buf = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical)
  );
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function wrapWithValidation(repo, {
  validate = validateEnvelope,
  hasher = null,
} = {}) {
  async function check(store, rec) {
    if (rec == null) return rec;
    const v = validate(rec);
    if (!v.ok) throw new CorruptionError(`corrupt record ${store}/${rec?.id ?? "?"}: ${v.error}`, { store, id: rec?.id });
    if (hasher && rec.contentHash) {
      const actual = await hasher(rec);
      if (actual !== rec.contentHash) {
        throw new CorruptionError(`content hash mismatch ${store}/${rec.id}`, { store, id: rec.id });
      }
    }
    return rec;
  }

  return {
    get: async (s, id) => check(s, await repo.get(s, id)),
    put: (s, r) => repo.put(s, r),
    delete: (s, id) => repo.delete(s, id),
    list: async (s) => {
      const all = await repo.list(s);
      for (const rec of all) await check(s, rec);
      return all;
    },
    clear: (s) => repo.clear(s),
    transaction: (stores, run) => repo.transaction(stores, run),
  };
}
