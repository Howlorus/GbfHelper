// Aggregates a §13.5 status per scan category from the running scan buffer.
// Never resolves to Complete unless we have evidence for every expected
// category AND no negative parser signal.
//
// Statuses (§13.5): Complete / Partial / Filtered / Stale / Inconsistent / Failed.
// This module also emits a short human-readable "reason" so the UI can be
// honest about WHY a category is not Complete.

export const CATEGORIES = Object.freeze(["characters", "weapons", "summons", "teams"]);

const NOT_STARTED = "not started";

export function computeCategoryStatus(buffer, category) {
  const records = buffer?.[category] || [];
  const parserStatus = buffer?.parserStatus?.[category];
  const warnings = (buffer?.warnings || []).filter((w) => w.startsWith(`${category}:`));

  if (records.length === 0 && !parserStatus) {
    return { status: "Partial", reason: NOT_STARTED, records: 0 };
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
  const anyPartial = records.some((r) => r.completeness === "partial");
  if (anyPartial) {
    return { status: "Partial", reason: "some records were missing expected fields", records: records.length };
  }
  if (parserStatus === "Partial") {
    return { status: "Partial", reason: "parser reported partial for a batch", records: records.length };
  }
  if (parserStatus === "Complete") {
    return { status: "Complete", reason: "all records observed with all expected fields", records: records.length };
  }
  // Records exist but no explicit parserStatus set — treat as Partial rather
  // than promoting to Complete without evidence.
  return { status: "Partial", reason: "records observed but no parser Complete signal", records: records.length };
}

export function computeReport(buffer) {
  const perCategory = {};
  let overall = "Complete";
  for (const cat of CATEGORIES) {
    perCategory[cat] = computeCategoryStatus(buffer, cat);
    if (perCategory[cat].status !== "Complete") overall = "Partial";
  }
  // Escalate overall to a more severe status if any category has one.
  const severity = { Complete: 0, Partial: 1, Filtered: 2, Stale: 2, Inconsistent: 3, Failed: 4 };
  let worst = "Complete";
  for (const cat of CATEGORIES) {
    if ((severity[perCategory[cat].status] ?? 0) > (severity[worst] ?? 0)) {
      worst = perCategory[cat].status;
    }
  }
  return { perCategory, overall: worst };
}

function firstWarning(list) {
  if (!list.length) return null;
  const w = list[0];
  const idx = w.indexOf(":");
  return idx >= 0 ? w.slice(idx + 1).trim() : w;
}
