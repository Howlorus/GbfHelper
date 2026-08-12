const END_REASONS = ["user-stop", "tab-closed", "tab-navigated-away"];

export function finalizeRun({ sessionId, raidId = null, tabTitle = null, startedAt, endedAt = Date.now(), endReason, events = [], finalState = null }) {
  if (typeof sessionId !== "string" || !sessionId) throw new TypeError("sessionId required");
  if (typeof startedAt !== "number") throw new TypeError("startedAt required");
  if (!END_REASONS.includes(endReason)) throw new TypeError(`endReason must be one of ${END_REASONS.join("|")}`);
  return {
    id: `run:${sessionId}`,
    sessionId,
    raidId,
    tabTitle,
    startedAt,
    endedAt,
    durationMs: Math.max(0, endedAt - startedAt),
    endReason,
    turns: finalState?.turn ?? null,
    finalStateQuality: finalState?.stateQuality ?? null,
    eventCount: events.length,
    events: events.slice(),
    finalState,
  };
}
