// US-11-06 bounded reason catalog (§34.4, §7.9). Every reason a Live Coach
// output can carry MUST be one of these keys — no free-form strings ever.
// The renderer produces a short, template-derived sentence from the key +
// params; the sentence is capped in length so the overlay never turns into
// an "AI paragraph" (§46 Phase 8: long-form AI is Review-mode only).
//
// Adding a reason means adding a row here AND updating the tests. The lint
// test (tests/live-coach-reason-catalog.test.js) scans the whole live-coach
// codebase and fails if any `reasonKey:` literal isn't in this catalog.

export const MAX_REASON_LENGTH = 200;

const TEMPLATES = Object.freeze({
  // ── sync / suspend ──────────────────────────────────────────────────────
  "waiting-for-sync":
    () => "Waiting for synchronized state before showing guidance.",
  "suspended-state-lost":
    ({ quality }) => `Guidance suspended: state quality is ${quality || "Unknown"}.`,

  // ── data availability ───────────────────────────────────────────────────
  "insufficient-data":
    ({ what }) => `Insufficient data on ${what || "current setup"} — no recommendation.`,

  // ── damage / cap ────────────────────────────────────────────────────────
  "damage-cap-ok":
    ({ metric, min, max }) => `${metric || "Damage"} within cap: setup covers ${min}–${max}.`,
  "damage-cap-under":
    ({ metric, min, max, cap }) => `${metric || "Damage"} likely under cap ${cap}: setup covers ${min}–${max}.`,

  // ── omen coverage ───────────────────────────────────────────────────────
  "omen-hitcount-clear":
    ({ required, coverMin, coverMax }) =>
      `Omen requires ≥ ${required} hits; setup covers ${coverMin}–${coverMax}.`,
  "omen-hitcount-marginal":
    ({ required, coverMin, coverMax }) =>
      `Omen requires ≥ ${required} hits; setup marginal at ${coverMin}–${coverMax}.`,
  "omen-hitcount-fail":
    ({ required, coverMin, coverMax }) =>
      `Omen requires ≥ ${required} hits; setup covers only ${coverMin}–${coverMax}.`,
  "omen-dispel-required":
    ({ n }) => `Dispel ≥ ${n || 1} buff${(n || 1) > 1 ? "s" : ""} before next omen resolves.`,
  "omen-cleanse-required":
    ({ debuffs }) => `Cleanse ${Array.isArray(debuffs) ? debuffs.join(", ") : (debuffs || "debuff")} before next omen resolves.`,

  // ── resource conservation ───────────────────────────────────────────────
  "charge-conserve":
    ({ turnsUntilBurst }) =>
      `Hold charge — full-chain window in ${turnsUntilBurst != null ? turnsUntilBurst : "?"} turn(s).`,
  "skill-window":
    ({ skill, expiresInTurns }) =>
      `Use ${skill || "skill"} — window closes in ${expiresInTurns != null ? expiresInTurns : "?"} turn(s).`,

  // ── raid lifecycle ──────────────────────────────────────────────────────
  "raid-ended": () => "Raid ended — Review is available.",
});

export const REASON_KEYS = Object.freeze(new Set(Object.keys(TEMPLATES)));

export function isReasonKey(x) {
  return typeof x === "string" && REASON_KEYS.has(x);
}

export function renderReason(key, params = {}) {
  if (!isReasonKey(key)) {
    throw new TypeError(`unknown reasonKey: ${JSON.stringify(key)} (add it to reasons.js)`);
  }
  const out = String(TEMPLATES[key](params || {}));
  if (out.length > MAX_REASON_LENGTH) {
    throw new RangeError(`reason for ${key} exceeds MAX_REASON_LENGTH (${out.length} > ${MAX_REASON_LENGTH})`);
  }
  return out;
}
