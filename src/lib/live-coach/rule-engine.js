// Declarative Rules Engine (§32). Rules ship inside a Strategy Pack's
// rules.json — declarative data only (§18.3, §41.4). This engine
// interprets a fixed set of operators; it cannot execute arbitrary code.
//
// Rule shape:
//   {
//     id: "rule.dispel.omen",
//     when: [{ path: "visibleOmen.kind", op: "eq", value: "hit-count" }, ...],
//     action: "DISPEL_NOW",    // key into reason-catalog
//     priority: 3,             // 1..5, higher = more urgent
//     confidence: "Likely",    // §33 assessment
//     source: "pack.bp.dark#v1.0.0"
//   }

import { renderReason } from "./reason-catalog.js";

const OPS = {
  eq: (a, b) => a === b,
  neq: (a, b) => a !== b,
  gte: (a, b) => a >= b,
  lte: (a, b) => a <= b,
  in: (a, b) => Array.isArray(b) && b.includes(a),
  exists: (a) => a !== undefined && a !== null,
};

// Read a dotted path from an object without executing anything.
function getPath(obj, path) {
  if (obj == null || typeof path !== "string") return undefined;
  return path.split(".").reduce((v, k) => (v == null ? v : v[k]), obj);
}

function conditionsMet(rule, state) {
  const when = rule?.when || [];
  for (const c of when) {
    const op = OPS[c?.op];
    if (!op) return false; // unknown op -> refuse
    const actual = getPath(state, c.path);
    if (!op(actual, c.value)) return false;
  }
  return true;
}

// Evaluate rules against a battle state. If state quality is not
// Synchronized, return a Suspended outcome (§10.3 last, §31.1) — never
// emit a critical recommendation on unreliable data.
export function evalRules(rules, state) {
  if (!state || state.stateQuality !== "Synchronized") {
    return {
      status: "Suspended",
      reasonKey: "STATE_SUSPENDED",
      reason: renderReason("STATE_SUSPENDED"),
      evidence: [`state quality: ${state?.stateQuality || "unknown"}`],
      confidence: "InsufficientData",
    };
  }
  if (!Array.isArray(rules) || rules.length === 0) {
    return { status: "NoRule", evidence: ["no rules loaded"] };
  }
  const matches = rules.filter((r) => conditionsMet(r, state));
  if (matches.length === 0) return { status: "NoMatch", evidence: [] };
  // Highest priority wins; ties broken by rule.id for determinism.
  matches.sort((a, b) => (b.priority || 0) - (a.priority || 0) || String(a.id).localeCompare(String(b.id)));
  const top = matches[0];
  return {
    status: "Recommendation",
    ruleId: top.id,
    action: top.action,
    priority: top.priority || 0,
    reasonKey: top.action,
    reason: renderReason(top.action),
    evidence: (top.when || []).map((c) => `${c.path} ${c.op} ${JSON.stringify(c.value)}`),
    confidence: top.confidence || "InsufficientData",
    source: top.source || null,
  };
}
