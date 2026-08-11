// Payload parsers, dispatched by capture "purpose" (endpoint category).
//
// PLACEHOLDER field maps — the actual GBF payload shapes are pinned by the
// feasibility slice (§49 Q1, Q11). Each PARSERS entry is a best-guess based
// on GBF's REST conventions. Missing fields on a record are marked
// "not observed" via null, and the record's completeness becomes "partial".
//
// Add a purpose here to enable it — the domain sink and status reporting
// pick it up automatically.

export const PARSERS = {};

export function registerParser(purpose, spec) {
  if (PARSERS[purpose]) throw new Error(`parser for '${purpose}' already registered`);
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
    const record = { _purpose: purpose, _capturedAt: Date.now() };
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
  if (!doc || typeof doc !== "object") return null;
  if (Array.isArray(doc[listKey])) return doc[listKey];
  // Fallback: GBF sometimes returns id-keyed dicts. Return values as list.
  return Object.values(doc).filter((v) => v && typeof v === "object");
}
