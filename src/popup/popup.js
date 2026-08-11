import { urlMatchesAllowlist } from "../lib/host-check.js";
import { STATES, EVENTS, isSessionActive } from "../lib/state-machine.js";

const SESSION_LABELS = {
  [STATES.ACCOUNT_SCAN_ACTIVE]: "Account Scan",
  [STATES.CALIBRATION_SESSION_ACTIVE]: "Calibration Session",
  [STATES.RAID_SESSION_ACTIVE]: "Raid Session",
  [STATES.KNOWLEDGE_UPDATE_ACTIVE]: "Knowledge Update",
};

const versionEl = document.getElementById("version");
if (versionEl) versionEl.textContent = "v" + chrome.runtime.getManifest().version;

document.getElementById("open-options")?.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

async function loadAllowlist() {
  const url = chrome.runtime.getURL("src/data/host-allowlist.json");
  const res = await fetch(url);
  return res.json();
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => resolve(r)));
}

async function getState() { return send({ type: "GET_STATE" }); }
async function dispatch(action) { return send({ type: "DISPATCH", action }); }

function setStatusChrome({ state, onGbf }) {
  const label = document.getElementById("status-label");
  const hint = document.getElementById("status-hint");
  document.body.dataset.gbf = onGbf ? "on" : "off";
  if (isSessionActive(state)) {
    label.textContent = "Active";
    hint.textContent = "A session is running. Stop it to change context.";
    return;
  }
  if (onGbf) {
    label.textContent = "Ready";
    hint.textContent = "Choose an action. Nothing runs until you start it.";
  } else {
    label.textContent = "Dormant";
    hint.textContent = "Open a Granblue Fantasy tab to enable session actions.";
  }
}

function showActions(state, { onGbf }) {
  const actions = document.getElementById("actions");
  const panel = document.getElementById("session-panel");
  const notice = document.getElementById("action-notice");

  if (isSessionActive(state)) {
    actions.hidden = true;
    panel.hidden = false;
    document.getElementById("session-panel-name").textContent =
      SESSION_LABELS[state.state] || state.state;
    document.getElementById("session-panel-meta").textContent =
      state.tabTitle ? `Tab: ${state.tabTitle}` : "";
    notice.textContent = "";
    return;
  }

  actions.hidden = false;
  panel.hidden = true;
  for (const btn of actions.querySelectorAll(".action")) {
    // Knowledge Update does not require a GBF tab; everything else does.
    btn.disabled = btn.dataset.event === "START_KNOWLEDGE_UPDATE" ? false : !onGbf;
  }
}

function showSessionBanner(state, activeTabId) {
  const banner = document.getElementById("session-banner");
  const titleEl = document.getElementById("session-tab-title");
  if (isSessionActive(state) && state.tabId != null && state.tabId !== activeTabId) {
    titleEl.textContent = state.tabTitle || `tab ${state.tabId}`;
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
}

async function refresh() {
  const [allowlist, tab, state] = await Promise.all([
    loadAllowlist(),
    getActiveTab(),
    getState(),
  ]);
  const onGbf = tab && tab.url ? urlMatchesAllowlist(tab.url, allowlist) : false;

  // Explicit user gesture (popup opened) on a GBF tab wakes the machine.
  if (onGbf && state.state === STATES.DISABLED) {
    await dispatch({ type: EVENTS.WAKE_IF_GBF, onGbf: true, tabId: tab.id, tabTitle: tab.title });
    return refresh();
  }

  setStatusChrome({ state, onGbf });
  showActions(state, { onGbf });
  showSessionBanner(state, tab?.id);
}

document.getElementById("actions").addEventListener("click", async (e) => {
  const btn = e.target.closest("button.action");
  if (!btn || btn.disabled) return;
  const type = btn.dataset.event;
  const tab = await getActiveTab();
  const next = await dispatch({ type, tabId: tab?.id, tabTitle: tab?.title });
  if (next?.error) {
    document.getElementById("action-notice").textContent = next.error;
    return;
  }
  const followUp = btn.dataset.followUp;
  if (followUp) {
    document.getElementById("action-notice").textContent =
      `Session started. Full behavior lands in ${followUp}.`;
  }
  await refresh();
});

document.getElementById("stop-button").addEventListener("click", async () => {
  await dispatch({ type: EVENTS.STOP_SESSION });
  await refresh();
});

// React to state changes coming from the service worker (e.g. tab close).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.state) refresh();
});

refresh().catch((err) => {
  document.getElementById("action-notice").textContent =
    `Popup init failed: ${err?.message || err}`;
});
