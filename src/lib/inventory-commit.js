// Interim commit path: chrome.storage.local under "inventory" with a
// previous-value snapshot under "inventoryPrev". E03 will replace both with
// a Repository Port + IndexedDB adapter.

import { CATEGORIES, computeReport } from "./scan-status.js";

export function buildInventoryFromBuffer(buffer, { schemaVersion = 1, extensionVersion = "0.0.0", committedAt = Date.now() } = {}) {
  const b = buffer || {};
  const out = {
    schemaVersion,
    extensionVersion,
    committedAt,
    completeness: computeReport(b),
    warnings: [...(b.warnings || [])],
  };
  for (const cat of CATEGORIES) out[cat] = [...(b[cat] || [])];
  return out;
}

// Produce the atomic write delta. Callers pass this to chrome.storage.local.set,
// which is atomic across all keys in a single call (both inventory and
// inventoryPrev land together, so a mid-write crash cannot leave inconsistency).
export function planCommit(oldInventory, buffer, meta) {
  const inventory = buildInventoryFromBuffer(buffer, meta);
  return oldInventory
    ? { inventory, inventoryPrev: oldInventory }
    : { inventory };
}
