// Per-category §13.5 aggregation. Never returns Complete without both records
// AND a positive parser signal — errs toward Partial rather than mislabel.

export const CATEGORIES = Object.freeze(["characters", "weapons", "summons", "teams"]);

export function computeCategoryStatus(buffer, category) {
  const records = buffer?.[category] || [];
  const parserStatus = buffer?.parserStatus?.[category];
  const warnings = (buffer?.warnings || []).filter((w) => w.startsWith(`${category}:`));

  if (records.length === 0 && !parserStatus) {
    return { status: "Partial", reason: "not started", records: 0 };
  }
  if (parserStatus === "Inconsistent") {
    return { status: "Inconsistent", reason: firstWarning(warnings) || "parser rejected payload shape", records: records.length };
  }
  if (parserStatus === "Unsupported") {
    return { status: "Failed", reason: "no parser registered for this category", records: records.length };
  }
  if (records.length === 0) {
    return { status: "Filtered", reason: "endpoint matched but the response yielded no records", records: 0 };
  }
  if (records.some((r) => r.completeness === "partial")) {
    return { status: "Partial", reason: "some records were missing expected fields", records: records.length };
  }
  if (parserStatus === "Partial") {
    return { status: "Partial", reason: "parser reported partial for a batch", records: records.length };
  }
  if (parserStatus === "Complete") {
    return { status: "Complete", reason: "all records observed with all expected fields", records: records.length };
  }
  return { status: "Partial", reason: "records observed but no parser Complete signal", records: records.length };
}

const SEVERITY = { Complete: 0, Partial: 1, Filtered: 2, Stale: 2, Inconsistent: 3, Failed: 4 };

export function computeReport(buffer) {
  const perCategory = {};
  let worst = "Complete";
  for (const cat of CATEGORIES) {
    perCategory[cat] = computeCategoryStatus(buffer, cat);
    if ((SEVERITY[perCategory[cat].status] ?? 0) > (SEVERITY[worst] ?? 0)) worst = perCategory[cat].status;
  }
  return { perCategory, overall: worst };
}

function firstWarning(list) {
  if (!list.length) return null;
  const w = list[0];
  const idx = w.indexOf(":");
  return idx >= 0 ? w.slice(idx + 1).trim() : w;
}
