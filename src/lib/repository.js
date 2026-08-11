// Repository Port. Every adapter (InMemory, IndexedDB, or the OPFS one that
// might come later per §50) must expose the same async surface. The domain
// layer depends on this interface, never on a concrete backend.

export const PORT_METHODS = Object.freeze([
  "get",
  "put",
  "delete",
  "list",
  "clear",
  "transaction",
]);

export function assertRepository(r) {
  if (!r || typeof r !== "object") throw new TypeError("repository must be an object");
  for (const m of PORT_METHODS) {
    if (typeof r[m] !== "function") throw new TypeError(`repository.${m} must be a function`);
  }
  return true;
}
