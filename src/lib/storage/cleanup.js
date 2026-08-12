// Cleanup policies (§35.3 Quick / §35.4 Advanced). All planners are pure —
// the SW composes them with the real repository. The planners produce a
// PLAN {stores[], reason}; applyCleanup(repo, plan) runs the deletes.

import { TIER, storesByTier } from "./tiers.js";

// Quick Cleanup (§35.3): only Rebuildable-tier stores are touched.
// Never any user data. Retention-controlled stores (runHistory, gameData,
// terminology) are excluded — Advanced Cleanup handles them.
export function planQuickCleanup() {
  return {
    stores: storesByTier(TIER.REBUILDABLE),
    reason: "safe-to-recreate stores only (§35.3)",
  };
}

// Advanced Cleanup (§35.4): caller picks a store list; we validate that any
// Critical store included requires typed confirmation (surfaced by the UI
// via requireTypedConfirmation). This module returns metadata for the plan;
// the UI decides whether to prompt harder.
export function planAdvancedCleanup(stores) {
  if (!Array.isArray(stores) || stores.length === 0) {
    return { stores: [], reason: "no stores selected", requireTypedConfirmation: false };
  }
  const critical = stores.filter((s) => storesByTier(TIER.CRITICAL).includes(s));
  return {
    stores,
    reason: critical.length
      ? `Advanced Cleanup will delete critical stores: ${critical.join(", ")}`
      : "Advanced Cleanup",
    requireTypedConfirmation: critical.length > 0,
  };
}

// "Delete all local data" — the highest-severity cleanup. Always requires
// typed confirmation. Wipes every store the repository knows about.
export function planWipeAll(allStoreNames) {
  return {
    stores: [...allStoreNames],
    reason: "Delete ALL local data (irreversible without a backup)",
    requireTypedConfirmation: true,
  };
}

export async function applyCleanup(repo, plan) {
  const before = {};
  const after = {};
  for (const store of plan.stores) {
    try { before[store] = (await repo.list(store)).length; } catch { before[store] = null; }
  }
  await repo.transaction(plan.stores, async (tx) => {
    for (const store of plan.stores) await tx.list(store).then(() => null);
  });
  // The above just proves the tx opens; do the actual deletes outside the tx
  // so partial failures don't roll BACK past what was already cleared. Each
  // store is cleared independently.
  for (const store of plan.stores) {
    try { await repo.clear(store); after[store] = 0; }
    catch (err) { after[store] = `error: ${err?.message || err}`; }
  }
  return { before, after, stores: plan.stores };
}
