export const STATE_QUALITY = Object.freeze({
  SYNCHRONIZED: "Synchronized",
  PARTIALLY_SYNCHRONIZED: "PartiallySynchronized",
  STALE: "Stale",
  CONFLICTING: "Conflicting",
});

export function buildInitialBattleState({ raidId = null, tabId = null, now = Date.now() } = {}) {
  return {
    raidId,
    tabId,
    turn: null,
    boss: null,
    stateQuality: STATE_QUALITY.PARTIALLY_SYNCHRONIZED,
    observedAt: now,
    lastObservedAt: now,
  };
}

export function applyEvent(state, event, { now = Date.now() } = {}) {
  const s = { ...state, lastObservedAt: now };
  if (event && typeof event === "object") {
    if (typeof event.turn === "number") s.turn = event.turn;
    if (event.boss) s.boss = { ...s.boss, ...event.boss };
  }
  s.stateQuality = computeStateQuality(s, { now });
  return s;
}

export function computeStateQuality(state, { now = Date.now(), staleAfterMs = 5000 } = {}) {
  if (!state) return STATE_QUALITY.PARTIALLY_SYNCHRONIZED;
  if (state.boss && Number.isFinite(state.boss.hp) && Number.isFinite(state.boss.hpMax) && state.boss.hp > state.boss.hpMax) {
    return STATE_QUALITY.CONFLICTING;
  }
  if (state.turn == null || state.boss == null) return STATE_QUALITY.PARTIALLY_SYNCHRONIZED;
  if (Number.isFinite(state.lastObservedAt) && (now - state.lastObservedAt) > staleAfterMs) {
    return STATE_QUALITY.STALE;
  }
  return STATE_QUALITY.SYNCHRONIZED;
}
