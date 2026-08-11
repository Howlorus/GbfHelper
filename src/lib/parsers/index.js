// Payload parsers, dispatched by capture "purpose" (endpoint category).
// Each spec is a table {listKey, fields}. Field maps are PLACEHOLDER guesses;
// feasibility (§49 Q1) pins the real GBF keys.

export const PARSERS = {};

export function registerParser(purpose, spec) {
  PARSERS[purpose] = spec;
}

export function parsePayload(purpose, body) {
  const spec = PARSERS[purpose];
  if (!spec) return { records: [], warnings: [`no parser for purpose '${purpose}'`], status: "Unsupported" };

  let doc;
  try {
    doc = JSON.parse(typeof body === "string" ? body : "");
  } catch (err) {
    return { records: [], warnings: [`json parse failed: ${err.message}`], status: "Inconsistent" };
  }

  const list = extractList(doc, spec.listKey);
  if (!list) {
    return { records: [], warnings: [`no list at key '${spec.listKey}' or top level`], status: "Inconsistent" };
  }

  const records = [];
  const warnings = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") {
      warnings.push("skipped non-object entry");
      continue;
    }
    const record = Object.create(null);
    record._purpose = purpose;
    record._capturedAt = Date.now();
    let missing = 0;
    for (const [field, sourceKey] of Object.entries(spec.fields)) {
      const v = raw[sourceKey];
      if (v === undefined) { record[field] = null; missing++; }
      else record[field] = v;
    }
    record.completeness = missing === 0 ? "observed" : "partial";
    records.push(record);
  }

  const status = records.length === 0
    ? "Filtered"
    : warnings.length === 0 && records.every((r) => r.completeness === "observed")
      ? "Complete"
      : "Partial";

  return { records, warnings, status };
}

function extractList(doc, listKey) {
  if (Array.isArray(doc)) return doc;
  if (doc && typeof doc === "object" && Array.isArray(doc[listKey])) return doc[listKey];
  return null;
}
