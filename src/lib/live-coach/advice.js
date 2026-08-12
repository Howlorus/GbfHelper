// US-11-06 advice pipeline (PRD §34.4, §7.9). Bridges rules-engine → overlay.
// Pure. The overlay renders EXACTLY the five fields §34.4 requires and never
// receives a free-form string.
//
// AC3 contract: the "reason" field is produced by renderReason(reasonKey, params).
// If reasonKey is not in REASON_KEYS, this throws — no bypass.

import { renderReason } from "./reasons.js";
import { suspendGate } from "./suspend.js";

// The overlay's field vocabulary. §34.4 says exactly five fields:
// Next threat / Recommended action / Short reason / Confidence / Synchronization.
export function buildAdvice({ rulesOutput, quality, stabilizer, nextThreat = null }) {
  const gate = suspendGate(quality, stabilizer);
  if (gate.suspended) {
    return {
      suspended: true,
      nextThreat: null,
      action: null,
      reason: renderReason("suspended-state-lost", { quality: gate.quality }),
      confidence: "InsufficientData",
      synchronization: gate.quality,
    };
  }
  if (!rulesOutput) {
    return {
      suspended: false,
      nextThreat,
      action: null,
      reason: renderReason("insufficient-data", { what: "current tick" }),
      confidence: "InsufficientData",
      synchronization: quality,
    };
  }
  return {
    suspended: false,
    nextThreat: nextThreat ?? rulesOutput.reasonParams?.threat ?? null,
    action: rulesOutput.action,
    reason: renderReason(rulesOutput.reasonKey, rulesOutput.reasonParams),
    confidence: rulesOutput.confidence,
    synchronization: quality,
    // extra metadata for auditing (not shown in the compact overlay):
    _audit: {
      ruleId: rulesOutput.ruleId,
      priority: rulesOutput.priority,
      evidence: rulesOutput.evidence,
      uncertainty: rulesOutput.uncertainty,
      expirationTicks: rulesOutput.expirationTicks,
      source: rulesOutput.source,
    },
  };
}
