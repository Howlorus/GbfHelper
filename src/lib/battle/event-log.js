// Battle event log (§26). Events are append-only; kinds match the §26
// list. Purposefully thin — the SW appends normalized events as the
// DevTools adapter observes them, and the log is dumped into a run
// history record at session end.

export const EVENT_KINDS = Object.freeze([
  "attack", "skill", "summon", "fullChain", "guard", "potion",
  "phaseTransition", "omen", "knockout", "stateQualityChange",
  "recommendation",
  "unknown",
]);

export function buildEvent(kind, { turn = null, actor = null, payload = null, ts = Date.now() } = {}) {
  return {
    ts,
    turn,
    kind: EVENT_KINDS.includes(kind) ? kind : "unknown",
    actor,
    payload: payload && typeof payload === "object" ? { ...payload } : payload,
  };
}

// Bounded append. §35.5 raw-events default is 30 days — retention lives
// downstream; the buffer only caps in-memory size per session so a very
// long raid doesn't OOM the SW.
export const EVENT_LOG_CAP = 10_000;

export function appendEvent(log, event) {
  const next = Array.isArray(log) ? log : [];
  if (next.length >= EVENT_LOG_CAP) return next;
  return next.concat([event]);
}
