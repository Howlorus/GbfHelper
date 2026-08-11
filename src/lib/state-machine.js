// Pure state machine for the extension's runtime lifecycle (PRD §12.1).
// No side effects, no chrome.* usage — the service worker wires actions in.

export const STATES = Object.freeze({
  DISABLED: "Disabled",
  GBF_IDLE: "GbfIdle",
  ACCOUNT_SCAN_ACTIVE: "AccountScanActive",
  CALIBRATION_SESSION_ACTIVE: "CalibrationSessionActive",
  RAID_SESSION_ACTIVE: "RaidSessionActive",
  KNOWLEDGE_UPDATE_ACTIVE: "KnowledgeUpdateActive",
});

export const EVENTS = Object.freeze({
  WAKE_IF_GBF: "WAKE_IF_GBF",
  GBF_TAB_LOST: "GBF_TAB_LOST",
  START_ACCOUNT_SCAN: "START_ACCOUNT_SCAN",
  START_CALIBRATION_SESSION: "START_CALIBRATION_SESSION",
  START_RAID_SESSION: "START_RAID_SESSION",
  START_KNOWLEDGE_UPDATE: "START_KNOWLEDGE_UPDATE",
  STOP_SESSION: "STOP_SESSION",
  TAB_CLOSED: "TAB_CLOSED",
  TAB_NAVIGATED_AWAY: "TAB_NAVIGATED_AWAY",
});

const SESSION_STATES = new Set([
  STATES.ACCOUNT_SCAN_ACTIVE,
  STATES.CALIBRATION_SESSION_ACTIVE,
  STATES.RAID_SESSION_ACTIVE,
  STATES.KNOWLEDGE_UPDATE_ACTIVE,
]);

export function initialState() {
  return { state: STATES.DISABLED, tabId: null, tabTitle: null, since: null };
}

export function isSessionActive(s) {
  return !!s && SESSION_STATES.has(s.state);
}

// reduce is pure: same input -> same output. The clock is injectable for tests.
export function reduce(current, action, { now = () => Date.now() } = {}) {
  const cs = current || initialState();
  const type = action?.type;
  const t = now();

  switch (cs.state) {
    case STATES.DISABLED:
      if (type === EVENTS.WAKE_IF_GBF && action.onGbf) {
        return { state: STATES.GBF_IDLE, tabId: action.tabId ?? null, tabTitle: action.tabTitle ?? null, since: t };
      }
      if (type === EVENTS.START_KNOWLEDGE_UPDATE) {
        // Knowledge updates don't require a GBF tab.
        return { state: STATES.KNOWLEDGE_UPDATE_ACTIVE, tabId: null, tabTitle: null, since: t };
      }
      return cs;

    case STATES.GBF_IDLE:
      if (type === EVENTS.START_ACCOUNT_SCAN)
        return { state: STATES.ACCOUNT_SCAN_ACTIVE, tabId: action.tabId ?? cs.tabId, tabTitle: action.tabTitle ?? cs.tabTitle, since: t };
      if (type === EVENTS.START_CALIBRATION_SESSION)
        return { state: STATES.CALIBRATION_SESSION_ACTIVE, tabId: action.tabId ?? cs.tabId, tabTitle: action.tabTitle ?? cs.tabTitle, since: t };
      if (type === EVENTS.START_RAID_SESSION)
        return { state: STATES.RAID_SESSION_ACTIVE, tabId: action.tabId ?? cs.tabId, tabTitle: action.tabTitle ?? cs.tabTitle, since: t };
      if (type === EVENTS.START_KNOWLEDGE_UPDATE)
        return { state: STATES.KNOWLEDGE_UPDATE_ACTIVE, tabId: null, tabTitle: null, since: t };
      if (type === EVENTS.GBF_TAB_LOST)
        return { state: STATES.DISABLED, tabId: null, tabTitle: null, since: t };
      return cs;

    default: {
      // Any session-active state.
      if (type === EVENTS.STOP_SESSION) {
        return cs.tabId != null
          ? { state: STATES.GBF_IDLE, tabId: cs.tabId, tabTitle: cs.tabTitle, since: t }
          : { state: STATES.DISABLED, tabId: null, tabTitle: null, since: t };
      }
      const matchesTab = action?.tabId != null && action.tabId === cs.tabId;
      if ((type === EVENTS.TAB_CLOSED || type === EVENTS.TAB_NAVIGATED_AWAY) && matchesTab) {
        return { state: STATES.GBF_IDLE, tabId: null, tabTitle: null, since: t };
      }
      // Any other event (including starting another session) is refused.
      return cs;
    }
  }
}
