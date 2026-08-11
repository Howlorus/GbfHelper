// Test / dev-only repository. Same contract as the IndexedDB adapter, but
// backed by a Map per store. Storage isolation (§7.6) is enforced by
// refusing operations against undeclared store names.

export class InMemoryRepository {
  #stores = new Map();

  constructor(storeNames) {
    if (!Array.isArray(storeNames) || storeNames.length === 0) {
      throw new Error("InMemoryRepository requires a non-empty list of store names");
    }
    for (const n of storeNames) this.#stores.set(n, new Map());
  }

  #store(name) {
    const s = this.#stores.get(name);
    if (!s) throw new Error(`unknown store '${name}'`);
    return s;
  }

  async get(store, id) {
    const rec = this.#store(store).get(id);
    return rec === undefined ? null : deepClone(rec);
  }

  async put(store, record) {
    if (!record || typeof record !== "object") throw new TypeError("record must be an object");
    if (record.id === undefined || record.id === null) throw new TypeError("record.id is required");
    this.#store(store).set(record.id, deepClone(record));
  }

  async delete(store, id) {
    return this.#store(store).delete(id);
  }

  async list(store) {
    return [...this.#store(store).values()].map(deepClone);
  }

  async clear(store) {
    this.#store(store).clear();
  }

  async transaction(stores, run) {
    // In-memory: no isolation from concurrent transactions (tests are
    // single-threaded). Snapshot on entry so we can roll back on throw.
    const snapshots = new Map();
    for (const s of stores) snapshots.set(s, new Map(this.#store(s)));
    try {
      const scoped = {
        get: (s, id) => this.get(s, id),
        put: (s, r) => this.put(s, r),
        delete: (s, id) => this.delete(s, id),
        list: (s) => this.list(s),
      };
      return await run(scoped);
    } catch (err) {
      for (const [name, snap] of snapshots) {
        this.#stores.set(name, snap);
      }
      throw err;
    }
  }
}

function deepClone(v) {
  return v == null ? v : structuredClone(v);
}
