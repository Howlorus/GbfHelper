// Substitution engine (PRD §20). Given a role that the account cannot fulfill
// with the strategy's default component, look up owned alternatives that
// cover at least one mandatory capability. Never fabricates a match — if
// no owned candidate covers even one mandatory capability, returns [].

// substitutions.json entry shape (per Strategy Pack §18.2):
//   { role: string, kind: "character"|"weapon"|"summon",
//     mandatory: string[], optional: string[],
//     candidates: [
//       { entityId, covers: string[], notCovered: string[],
//         adaptation: string, confidence: "high"|"medium"|"low" }
//     ] }
//
// Only candidates that are actually OWNED (present in inventory[kind]) are
// returned. A candidate that covers no mandatory capability is dropped
// even if owned — §20 explicitly refuses to propose it.

const KIND_TO_INV = { character: "characters", weapon: "weapons", summon: "summons" };

export function proposeSubstitutions(substitutions, role, inventory) {
  if (!Array.isArray(substitutions)) return [];
  const entry = substitutions.find((s) => s?.role === role);
  if (!entry) return [];
  const invKey = KIND_TO_INV[entry.kind];
  if (!invKey) return [];
  const owned = new Set((inventory?.[invKey] || []).map((it) => it.id));
  const mandatory = new Set(entry.mandatory || []);
  const out = [];
  for (const c of entry.candidates || []) {
    if (!owned.has(c.entityId)) continue;
    if (mandatory.size) {
      const coversAtLeastOneMandatory = (c.covers || []).some((cap) => mandatory.has(cap));
      if (!coversAtLeastOneMandatory) continue;
    }
    out.push({
      role, kind: entry.kind,
      entityId: c.entityId,
      covers: c.covers || [],
      notCovered: c.notCovered || [],
      adaptation: c.adaptation || null,
      confidence: c.confidence || "low",
    });
  }
  out.sort((a, b) => rank(b.confidence) - rank(a.confidence));
  return out;
}

function rank(c) { return { high: 3, medium: 2, low: 1 }[c] || 0; }
