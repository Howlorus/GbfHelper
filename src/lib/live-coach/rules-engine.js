// US-11-03 Rules Engine (PRD §32). Pure evaluator.
//
// A rule is a declarative object shipped in a Strategy Pack:
//   {
//     id: string,
//     priority: "critical" | "high" | "normal" | "low",
//     when: (state, ctx) => bool | { match: bool, evidence: any[] },
//     produce: (state, ctx) => {
//       action: string,
//       reasonKey: <keyof reason-catalog>,
//       reasonParams?: object,
//       evidence?: any[],
//       confidence?: "Confirmed" | "Likely" | "Marginal" | "Uncertain" | "InsufficientData",
//       uncertainty?: string,
//       expirationTicks?: number,
//       source?: { packId?, packVersion?, ruleId? },
//     }
//   }
//
// evaluate(state, ruleSet, ctx) returns the single highest-priority match
// with the §32 payload, or null. Ties break by rule id ascending (AC2:
// deterministic, never arbitrary).
//
// AC3: if a rule fires with confidence === InsufficientData, its priority
// is coerced to "low" so critical guidance is never emitted on stale data.

import { isReasonKey } from "./reasons.js";

const PRIORITY_RANK = { critical: 0, high: 1, normal: 2, low: 3 };

function priorityRank(p) {
  return PRIORITY_RANK[p] ?? 3;
}

function normalizeWhen(when, state, ctx) {
  const raw = when(state, ctx);
  if (raw && typeof raw === "object") return { match: !!raw.match, evidence: raw.evidence || [] };
  return { match: !!raw, evidence: [] };
}

export function evaluate(state, ruleSet, ctx = {}) {
  if (!Array.isArray(ruleSet)) return null;
  const matches = [];
  for (const rule of ruleSet) {
    if (!rule || typeof rule.when !== "function" || typeof rule.produce !== "function") continue;
    let cond;
    try { cond = normalizeWhen(rule.when, state, ctx); }
    catch { continue; }
    if (!cond.match) continue;

    let out;
    try { out = rule.produce(state, ctx); }
    catch { continue; }
    if (!out || !isReasonKey(out.reasonKey)) continue; // §34.4 no free-form reasons

    const confidence = out.confidence || "Uncertain";
    const priority = confidence === "InsufficientData" ? "low" : (rule.priority || "normal");

    matches.push({
      ruleId: rule.id,
      priority,
      action: out.action || null,
      reasonKey: out.reasonKey,
      reasonParams: out.reasonParams || {},
      evidence: [...(cond.evidence || []), ...(out.evidence || [])],
      confidence,
      uncertainty: out.uncertainty || null,
      expirationTicks: Number.isFinite(out.expirationTicks) ? out.expirationTicks : null,
      source: {
        packId: rule.packId ?? ctx.packId ?? null,
        packVersion: rule.packVersion ?? ctx.packVersion ?? null,
        ruleId: rule.id,
        ...(out.source || {}),
      },
    });
  }
  if (!matches.length) return null;
  matches.sort((a, b) => (priorityRank(a.priority) - priorityRank(b.priority))
    || String(a.ruleId).localeCompare(String(b.ruleId)));
  return matches[0];
}

// AC1 helper: return the whole ordered match list — useful for tests and
// for future overlays that want a "top-3" chip strip.
export function evaluateAll(state, ruleSet, ctx = {}) {
  if (!Array.isArray(ruleSet)) return [];
  const one = evaluate(state, ruleSet, ctx);
  if (!one) return [];
  // Cheap: re-run to collect the sorted list. Small rule sets — fine.
  const collected = [];
  for (const rule of ruleSet) {
    if (!rule || typeof rule.when !== "function" || typeof rule.produce !== "function") continue;
    let cond;
    try { cond = normalizeWhen(rule.when, state, ctx); } catch { continue; }
    if (!cond.match) continue;
    let out;
    try { out = rule.produce(state, ctx); } catch { continue; }
    if (!out || !isReasonKey(out.reasonKey)) continue;
    const confidence = out.confidence || "Uncertain";
    const priority = confidence === "InsufficientData" ? "low" : (rule.priority || "normal");
    collected.push({
      ruleId: rule.id, priority, action: out.action || null,
      reasonKey: out.reasonKey, reasonParams: out.reasonParams || {},
      confidence, uncertainty: out.uncertainty || null,
    });
  }
  collected.sort((a, b) => (priorityRank(a.priority) - priorityRank(b.priority))
    || String(a.ruleId).localeCompare(String(b.ruleId)));
  return collected;
}
