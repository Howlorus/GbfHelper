// US-14-04 proposal → Raid Plan variant flow (PRD §29, §7.7). Pure.
//
// E14 does not write plans directly (Notes on US-14-04): it always goes
// through E07's approval flow. This module builds the {plan input, audit
// entry} the caller hands to raid-plan/repository.saveNewVersion(), and
// records the human decision.
//
// Human approval is enforced upstream — the caller only ever gets to
// convert an *approved* proposal into a variant.

import { diffPlans } from "../raid-plan/compare.js";

export const DECISION = Object.freeze({
  ACCEPTED: "accepted",
  REJECTED: "rejected",
});

// Apply a proposal's changedFields onto a plan. Pure — returns a new plan
// input suitable for buildRaidPlan / saveNewVersion.
export function applyProposal(sourcePlan, proposal, { newPlanId } = {}) {
  if (!sourcePlan) throw new TypeError("sourcePlan required");
  if (!proposal || !Array.isArray(proposal.changedFields)) {
    throw new TypeError("proposal.changedFields required");
  }
  const patched = { ...sourcePlan };
  for (const change of proposal.changedFields) {
    if (!change || !change.field) continue;
    patched[change.field] = change.to;
  }
  const { id, raidPlanVersion, createdAt, updatedAt, ...rest } = patched;
  return {
    ...rest,
    planId: newPlanId || `${sourcePlan.planId}-variant`,
    status: "variant",
    changeSource: `proposal:${proposal.id}`,
    previousVersion: null,
  };
}

// AC2/AC4 audit entry — persisted alongside the plan history. Keeps the
// trail even for rejected proposals (no plan is written in that case).
export function buildAuditEntry({ proposal, decision, plan, now = Date.now(), userNote = null }) {
  if (!proposal) throw new TypeError("proposal required");
  if (!Object.values(DECISION).includes(decision)) throw new TypeError(`decision must be one of ${Object.values(DECISION).join("|")}`);
  return {
    id: `audit:${proposal.id}:${now}`,
    kind: "proposal-decision",
    proposalId: proposal.id,
    proposalSource: proposal.source,
    dimension: proposal.dimension,
    changedFields: proposal.changedFields,
    decidedAt: now,
    decision,
    userNote,
    planContext: plan ? {
      planId: plan.planId, raidPlanVersion: plan.raidPlanVersion,
    } : null,
  };
}

// AC3: E07's compare view (US-07-07) can be fed with the two plan candidates.
export function compareProposalAgainstPlan(sourcePlan, proposal) {
  const patchedInput = applyProposal(sourcePlan, proposal);
  return diffPlans(sourcePlan, patchedInput);
}
