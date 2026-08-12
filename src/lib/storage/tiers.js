export const TIER = Object.freeze({
  CRITICAL: "critical",
  CONFIGURABLE: "configurable",
  REBUILDABLE: "rebuildable",
});

const STORE_TIER = {
  gameData: TIER.CONFIGURABLE,
  strategyPacks: TIER.CRITICAL, // user-reviewed strategies are §35.1 critical
  terminologyPacks: TIER.CONFIGURABLE,
  inventory: TIER.CRITICAL,
  raidPlans: TIER.CRITICAL,
  notes: TIER.CRITICAL,
  runHistory: TIER.CONFIGURABLE,
  calibration: TIER.CRITICAL,
  searchIndexes: TIER.REBUILDABLE,
  sourceCache: TIER.REBUILDABLE,
  settings: TIER.CRITICAL,
  diagnostics: TIER.REBUILDABLE,
};

export function tierOf(storeName) {
  return STORE_TIER[storeName] || null;
}

export function storesByTier(tier) {
  return Object.entries(STORE_TIER).filter(([, t]) => t === tier).map(([n]) => n);
}
