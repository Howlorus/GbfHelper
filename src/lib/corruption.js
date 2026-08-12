// Corruption detection layer over any Repository. Envelope shape is checked
// on BOTH read and write — write-side enforcement closes the "write an
// envelope-less record then blow up on the next read" gap.

import { assertEnvelope } from "./envelope.js";

export class CorruptionError extends Error {
  constructor(message, { store, id } = {}) {
    super(message);
    this.name = "CorruptionError";
    this.store = store;
    this.id = id;
  }
}

export function wrapWithValidation(repo) {
  function checkOrThrow(store, rec) {
    if (rec == null) return rec;
    try {
      assertEnvelope(rec);
    } catch (err) {
      throw new CorruptionError(`corrupt record ${store}/${rec?.id ?? "?"}: ${err.message}`, { store, id: rec?.id });
    }
    return rec;
  }

  return {
    get: async (s, id) => checkOrThrow(s, await repo.get(s, id)),
    put: async (s, r) => { checkOrThrow(s, r); return repo.put(s, r); },
    delete: (s, id) => repo.delete(s, id),
    list: async (s) => {
      const all = await repo.list(s);
      for (const rec of all) checkOrThrow(s, rec);
      return all;
    },
    clear: (s) => repo.clear(s),
    transaction: (stores, run) => repo.transaction(stores, run),
  };
}
