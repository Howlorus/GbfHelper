import { urlMatchesAllowlist } from "../lib/host-check.js";
import { STATES, EVENTS, isSessionActive, sessionMeta } from "../lib/state-machine.js";

function fmtDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
}

let durationTimer = null;
function stopDurationTimer() {
  if (durationTimer != null) {
    clearInterval(durationTimer);
    durationTimer = null;
  }
}
function startDurationTimer(since) {
  stopDurationTimer();
  const el = document.getElementById("session-duration");
  const tick = () => { el.textContent = fmtDuration(Date.now() - since); };
  tick();
  durationTimer = setInterval(tick, 1000);
}

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
    const meta = sessionMeta(state);
    actions.hidden = true;
    panel.hidden = false;
    document.getElementById("session-panel-name").textContent = meta?.kind || state.state;
    document.getElementById("session-tab").textContent = state.tabTitle || "—";
    document.getElementById("session-category").textContent = meta?.category || "—";
    if (state.since) startDurationTimer(state.since);
    notice.textContent = "";
    return;
  }

  stopDurationTimer();
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
