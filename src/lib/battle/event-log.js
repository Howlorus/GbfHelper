const EVENT_LOG_CAP = 10_000;

export function buildEvent(kind, { turn = null, actor = null, payload = null, ts = Date.now() } = {}) {
  return {
    ts,
    turn,
    kind: kind || "unknown",
    actor,
    payload: payload && typeof payload === "object" ? { ...payload } : payload,
  };
}

export function appendEvent(log, event) {
  const next = Array.isArray(log) ? log : [];
  return next.length >= EVENT_LOG_CAP ? next : next.concat([event]);
}
