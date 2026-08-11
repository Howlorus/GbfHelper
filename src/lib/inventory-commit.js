// Pure functions for the scan -> inventory commit path. The chrome storage
// write itself lives in the service worker; this module handles the shape
// transformation and the completeness report snapshot.
//
// Interim: writes go to chrome.storage.local under "inventory" with a
// previous-value snapshot under "inventoryPrev" for a one-step rollback.
// E03 will replace both by proper repositories with schema-migrated envelopes.

import { computeReport } from "./scan-status.js";

export const CATEGORIES = Object.freeze(["characters", "weapons", "summons", "teams"]);

export function buildInventoryFromBuffer(buffer, { schemaVersion = 1, extensionVersion = "0.0.0", committedAt = Date.now() } = {}) {
  const b = buffer || {};
  const report = computeReport(b);
  const out = {
    schemaVersion,
    extensionVersion,
    committedAt,
    completeness: report,
    warnings: [...(b.warnings || [])],
  };
  for (const cat of CATEGORIES) out[cat] = [...(b[cat] || [])];
  return out;
}

export function summarizeReport(report) {
  return CATEGORIES.map((cat) => {
    const c = report.perCategory[cat] || {};
    return `${cat}: ${c.status || "n/a"} (${c.records ?? 0})`;
  }).join(" · ");
}
