// Session finalization (§26 run logger). On RaidSessionActive -> not-active
// transition, the SW packages the accumulated events + final state into a
// single run history record.

export const END_REASONS = Object.freeze([
  "user-stop", "tab-closed", "tab-navigated-away", "raid-ended", "sw-restart",
]);

export function finalizeRun({
  sessionId,
  raidId,
  raidPlanRef = null,
  tabTitle = null,
  startedAt,
  endedAt = Date.now(),
  endReason,
  events = [],
  finalState = null,
  setupFingerprint = null,
  excludedFromLearning = false,
}) {
  if (typeof sessionId !== "string" || !sessionId) throw new TypeError("sessionId required");
  if (typeof startedAt !== "number") throw new TypeError("startedAt required");
  if (!END_REASONS.includes(endReason)) throw new TypeError(`endReason must be one of ${END_REASONS.join("|")}`);
  return {
    id: `run:${sessionId}`,
    sessionId,
    raidId: raidId ?? null,
    raidPlanRef,
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
    setupFingerprint,
    excludedFromLearning,
  };
}
