// US-11-05 suspend critical advice on state loss (PRD §7.5, §10.3, §31.1).
// Pure. The overlay holds a small stabilizer that gates guidance until state
// quality has been Synchronized for STATE_STABILIZE_TICKS ticks in a row.

import { STATE_QUALITY } from "../battle/state-model.js";

export const STATE_STABILIZE_TICKS = 3;

export function initialStabilizer() {
  return { consecutiveSync: 0, resumed: false };
}

// Fold a new state-quality reading into the stabilizer. Never mutates.
// Returns { consecutiveSync, resumed }.
export function updateStabilizer(prev, currentQuality) {
  const state = prev && typeof prev === "object" ? prev : initialStabilizer();
  if (currentQuality === STATE_QUALITY.SYNCHRONIZED) {
    const consecutiveSync = state.consecutiveSync + 1;
    return { consecutiveSync, resumed: consecutiveSync >= STATE_STABILIZE_TICKS };
  }
  return { consecutiveSync: 0, resumed: false };
}

// suspendGate is the single decision point every renderer must consult.
// { suspended: true, quality } → overlay shows "Guidance suspended: <quality>"
// { suspended: false } → recommendations render normally.
export function suspendGate(currentQuality, stabilizer) {
  if (currentQuality !== STATE_QUALITY.SYNCHRONIZED) {
    return { suspended: true, quality: currentQuality || "Unknown" };
  }
  if (!stabilizer?.resumed) {
    return { suspended: true, quality: STATE_QUALITY.SYNCHRONIZED, reason: "stabilizing" };
  }
  return { suspended: false };
}
