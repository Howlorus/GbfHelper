// Battle State Model (§31). Pure. The service worker holds the current
// state in chrome.storage.session and rebuilds it from event stream on
// service-worker wake — see US-09-03 for the wiring.

// Ranked from best to worst. computeStateQuality picks the LEAST reliable
// quality across every reason it might see (§7.5 never silently continue).
export const STATE_QUALITY = Object.freeze({
  SYNCHRONIZED: "Synchronized",
  PARTIALLY_SYNCHRONIZED: "PartiallySynchronized",
  STALE: "Stale",
  CONFLICTING: "Conflicting",
  UNSUPPORTED: "Unsupported",
  LOST: "Lost",
});
const RANK = { Synchronized: 0, PartiallySynchronized: 1, Stale: 2, Conflicting: 3, Unsupported: 4, Lost: 5 };

// Fields with a null default until an event fills them. lastObservedAt is
// the wall clock we use to detect Stale.
export function buildInitialBattleState({ raidId = null, raidVersion = null, tabId = null, now = Date.now() } = {}) {
  return {
    raidId,
    raidVersion,
    tabId,
    turn: null,
    boss: null,
    party: [],
    summons: [],
    potions: null,
    fieldEffects: [],
    visibleOmen: null,
    lastObservedAction: null,
    stateQuality: STATE_QUALITY.PARTIALLY_SYNCHRONIZED,
    observedAt: now,
    lastObservedAt: now,
  };
}

// Merges an observation into the state. `event` is a normalized battle
// event (see event-log.js) — this function just knows how to update the
// snapshot from the well-known event shapes.
export function applyEvent(state, event, { now = Date.now() } = {}) {
  const s = { ...state, lastObservedAt: now };
  if (!event || typeof event !== "object") return s;
  if (typeof event.turn === "number") s.turn = event.turn;
  if (event.boss) s.boss = { ...s.boss, ...event.boss };
  if (Array.isArray(event.party)) s.party = event.party;
  if (Array.isArray(event.summons)) s.summons = event.summons;
  if (event.potions) s.potions = { ...s.potions, ...event.potions };
  if (Array.isArray(event.fieldEffects)) s.fieldEffects = event.fieldEffects;
  if (event.visibleOmen !== undefined) s.visibleOmen = event.visibleOmen;
  if (event.lastObservedAction !== undefined) s.lastObservedAction = event.lastObservedAction;
  s.stateQuality = computeStateQuality(s, { now });
  return s;
}

// Downgrades on any negative signal: stale timestamp, contradictory HP,
// or missing required fields for the raid. Callers pass optional flags to
// surface Lost / Unsupported.
export function computeStateQuality(state, { now = Date.now(), staleAfterMs = 5000, lost = false, unsupported = false, conflicting = false } = {}) {
  const worst = (a, b) => (RANK[a] >= RANK[b] ? a : b);
  let q = STATE_QUALITY.SYNCHRONIZED;

  if (state == null) return STATE_QUALITY.LOST;
  if (lost) return STATE_QUALITY.LOST;
  if (unsupported) return STATE_QUALITY.UNSUPPORTED;
  if (conflicting) return STATE_QUALITY.CONFLICTING;

  const missing = requiredMissing(state);
  if (missing.length > 0) q = worst(q, STATE_QUALITY.PARTIALLY_SYNCHRONIZED);

  if (state.boss && Number.isFinite(state.boss.hp) && Number.isFinite(state.boss.hpMax) && state.boss.hp > state.boss.hpMax) {
    return STATE_QUALITY.CONFLICTING;
  }
  if (Number.isFinite(state.lastObservedAt) && (now - state.lastObservedAt) > staleAfterMs) {
    q = worst(q, STATE_QUALITY.STALE);
  }
  return q;
}

function requiredMissing(state) {
  const missing = [];
  if (state.turn == null) missing.push("turn");
  if (state.boss == null) missing.push("boss");
  if (!Array.isArray(state.party) || state.party.length === 0) missing.push("party");
  return missing;
}
