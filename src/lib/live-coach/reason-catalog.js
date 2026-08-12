// Bounded reason catalog. The Rules Engine emits a reason KEY; the overlay
// renders the string from this map. This is US-11-06's structural guard:
// unbounded AI-generated strings never reach the combat UI because there
// is no path from a free-form string to the overlay renderer.

export const REASON = Object.freeze({
  DISPEL_NOW: "Dispel the boss buff before the next omen",
  GUARD_INCOMING: "Guard this turn — heavy hit incoming",
  FULL_CHAIN_READY: "Full Chain is ready — use it now",
  SAVE_SUMMON: "Save your main summon for the phase transition",
  POTION_URGENT: "Restore HP before the next big hit",
  ROTATION_STEP: "Advance the rotation to the next step",
  STATE_SUSPENDED: "Guidance suspended: state quality dropped below Synchronized",
});

export function renderReason(key) {
  return REASON[key] || null;
}
