// Canonical §7.6 storage categories. Every persisted record lives in exactly
// one of these stores; cross-store writes are impossible through the port.
// Retention tiers (§35.1) are added by E13 when Quick / Advanced Cleanup
// need them.

export const STORE_NAMES = Object.freeze([
  "gameData",
  "strategyPacks",
  "terminologyPacks",
  "inventory",
  "raidPlans",
  "notes",
  "runHistory",
  "calibration",
  "searchIndexes",
  "sourceCache",
  "settings",
  "diagnostics",
]);
