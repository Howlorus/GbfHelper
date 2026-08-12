// Pure builder of inventory record CONTENT from a scan buffer. The envelope
// (schemaVersion, timestamps, versions) is stamped by wrapEnvelope in the
// service worker before the repository write.

import { STORE_NAMES } from "./stores.js";
import { computeReport } from "./scan-status.js";

const CATEGORIES = ["characters", "weapons", "summons", "teams"];

export function buildInventoryContent(buffer) {
  const b = buffer || {};
  const out = {
    completeness: computeReport(b),
    warnings: [...(b.warnings || [])],
  };
  for (const cat of CATEGORIES) out[cat] = [...(b[cat] || [])];
  return out;
}

export { STORE_NAMES };
