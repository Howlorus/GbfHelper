// US-05-09 conflict detection (PRD §16.6). Pure. Detects — never resolves.
// Two claims conflict when they share (kind, canonicalId, dimension) but
// disagree on value. Both sides stay; resolution is human (AC3 of US-05-09).

function stableValue(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    try { return JSON.stringify(v, Object.keys(v).sort()); } catch { return String(v); }
  }
  return String(v);
}

export function detectConflicts(claims) {
  if (!Array.isArray(claims)) return [];
  const out = [];
  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const a = claims[i]; const b = claims[j];
      if (!a || !b) continue;
      if (!a.kind || a.kind !== b.kind) continue;
      if (!a.canonicalId || a.canonicalId !== b.canonicalId) continue;
      if (!a.dimension || a.dimension !== b.dimension) continue;
      const va = stableValue(a.value);
      const vb = stableValue(b.value);
      if (va === vb) continue;
      out.push({
        a, b,
        dimension: a.dimension,
        reason: "value-mismatch",
        reviewStatus: "conflicting", // §17.3 — callers set both sides to this
      });
    }
  }
  return out;
}
