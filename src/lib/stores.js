// Canonical §7.6 storage categories. Every persisted record lives in exactly
// one of these stores; cross-store writes are impossible through the
// Repository Port. The domain classifies each store's data by §35.1 tier so
// E13 Storage dashboard knows what a Quick Cleanup may touch.

export const STORE_TIERS = Object.freeze({
  CRITICAL: "critical",              // §35.1 protected by default
  CONFIGURABLE_RETENTION: "configurable",
  REBUILDABLE: "rebuildable",        // §35.1 safe to recreate
});

export const STORES = Object.freeze({
  gameData:        { tier: STORE_TIERS.CONFIGURABLE_RETENTION },
  strategyPacks:   { tier: STORE_TIERS.CONFIGURABLE_RETENTION },
  terminologyPacks:{ tier: STORE_TIERS.CONFIGURABLE_RETENTION },
  inventory:       { tier: STORE_TIERS.CRITICAL },
  raidPlans:       { tier: STORE_TIERS.CRITICAL },
  notes:           { tier: STORE_TIERS.CRITICAL },
  runHistory:      { tier: STORE_TIERS.CONFIGURABLE_RETENTION },
  calibration:     { tier: STORE_TIERS.CRITICAL },
  searchIndexes:   { tier: STORE_TIERS.REBUILDABLE },
  sourceCache:     { tier: STORE_TIERS.REBUILDABLE },
  settings:        { tier: STORE_TIERS.CRITICAL },
  diagnostics:     { tier: STORE_TIERS.REBUILDABLE },
});

export const STORE_NAMES = Object.freeze(Object.keys(STORES));

export function storesByTier(tier) {
  return STORE_NAMES.filter((n) => STORES[n].tier === tier);
}
