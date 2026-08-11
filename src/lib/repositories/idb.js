// IndexedDB adapter. Same shape as InMemoryRepository so consumers depend
// only on the Repository Port. Uses the global `indexedDB` (browser API,
// not chrome.*) so this file passes the lint rule for src/lib.

const DB_NAME = "gbf-copilot";

export class IndexedDBRepository {
  #dbPromise;
  #stores;

  constructor({ stores, version = 1 }) {
    if (!Array.isArray(stores) || stores.length === 0) {
      throw new Error("IndexedDBRepository requires a non-empty list of store names");
    }
    this.#stores = stores;
    this.#dbPromise = this.#open(version);
  }

  #open(version) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, version);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of this.#stores) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: "id" });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async #run(stores, mode, fn) {
    const db = await this.#dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("transaction aborted"));
      Promise.resolve()
        .then(() => fn(tx))
        .then((r) => { result = r; })
        .catch((err) => { try { tx.abort(); } catch {} reject(err); });
    });
  }

  async get(store, id) {
    return this.#run([store], "readonly", (tx) =>
      wrap(tx.objectStore(store).get(id)).then((r) => r ?? null));
  }

  async put(store, record) {
    if (!record || typeof record !== "object") throw new TypeError("record must be an object");
    if (record.id === undefined || record.id === null) throw new TypeError("record.id is required");
    return this.#run([store], "readwrite", (tx) => wrap(tx.objectStore(store).put(record)));
  }

  async delete(store, id) {
    return this.#run([store], "readwrite", (tx) => wrap(tx.objectStore(store).delete(id)));
  }

  async list(store) {
    return this.#run([store], "readonly", (tx) => wrap(tx.objectStore(store).getAll()));
  }

  async clear(store) {
    return this.#run([store], "readwrite", (tx) => wrap(tx.objectStore(store).clear()));
  }

  async transaction(stores, run) {
    return this.#run(stores, "readwrite", (tx) => {
      const scoped = {
        get: (s, id) => wrap(tx.objectStore(s).get(id)).then((r) => r ?? null),
        put: (s, r) => wrap(tx.objectStore(s).put(r)),
        delete: (s, id) => wrap(tx.objectStore(s).delete(id)),
        list: (s) => wrap(tx.objectStore(s).getAll()),
      };
      return run(scoped);
    });
  }
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
