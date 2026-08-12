// Typed per-store accessors on top of a Repository. Domain code writes
//   await db.raidPlans.put(plan)
// instead of
//   await repo.put("raidPlans", plan)
// which is one indirection but wipes out a whole class of typos (unknown
// store names caught at call site, not on the first runtime attempt).

import { STORE_NAMES } from "./stores.js";

export function createStoreAccessors(repo) {
  const bind = (store) => Object.freeze({
    get: (id) => repo.get(store, id),
    put: (record) => repo.put(store, record),
    delete: (id) => repo.delete(store, id),
    list: () => repo.list(store),
    clear: () => repo.clear(store),
  });
  const out = {};
  for (const name of STORE_NAMES) out[name] = bind(name);
  out.transaction = (stores, run) => repo.transaction(stores, run);
  return Object.freeze(out);
}
