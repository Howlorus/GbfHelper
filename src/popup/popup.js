import { urlMatchesAllowlist } from "../lib/host-check.js";
import { STATES, EVENTS, isSessionActive, sessionMeta } from "../lib/state-machine.js";
import { CATEGORIES, computeCategoryStatus } from "../lib/scan-status.js";

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

document.getElementById("open-planner")?.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL("src/planner/planner.html") });
});

document.getElementById("open-update-center")?.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL("src/update-center/update-center.html") });
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

function showActions(state, { onGbf, scanProgress, scanBuffer }) {
  const actions = document.getElementById("actions");
  const panel = document.getElementById("session-panel");
  const notice = document.getElementById("action-notice");
  const scanBlock = document.getElementById("scan-progress");

  if (isSessionActive(state)) {
    const meta = sessionMeta(state);
    actions.hidden = true;
    panel.hidden = false;
    document.getElementById("session-panel-name").textContent = meta?.kind || state.state;
    document.getElementById("session-tab").textContent = state.tabTitle || "—";
    document.getElementById("session-category").textContent = meta?.category || "—";
    if (state.since) startDurationTimer(state.since);
    notice.textContent = "";
    scanBlock.hidden = state.state !== STATES.ACCOUNT_SCAN_ACTIVE;
    if (state.state === STATES.ACCOUNT_SCAN_ACTIVE) {
      renderScanProgress(scanProgress, scanBuffer);
      const hasRecords = CATEGORIES.some((p) => (scanBuffer?.[p]?.length || 0) > 0);
      document.getElementById("commit-button").hidden = !hasRecords;
    } else {
      document.getElementById("commit-button").hidden = true;
    }
    // Focus a non-destructive control by default (never Save, never Discard).
    if (document.activeElement === document.body) {
      document.getElementById("session-panel-name")?.focus?.();
    }
    return;
  }

  stopDurationTimer();
  actions.hidden = false;
  panel.hidden = true;
  scanBlock.hidden = true;
  for (const btn of actions.querySelectorAll(".action")) {
    // Knowledge Update does not require a GBF tab; everything else does.
    btn.disabled = btn.dataset.event === "START_KNOWLEDGE_UPDATE" ? false : !onGbf;
  }
}

function renderScanProgress(progress, buffer) {
  for (const cat of CATEGORIES) {
    const count = progress?.purposeCounts?.[cat] ?? 0;
    const s = computeCategoryStatus(buffer, cat);
    document.getElementById(`scan-count-${cat}`).textContent = String(count);
    document.getElementById(`scan-status-${cat}`).textContent = s.status;
    document.getElementById(`scan-reason-${cat}`).textContent = s.reason || "";
  }
  const last = progress?.lastObserved;
  const lastEl = document.getElementById("scan-last");
  const lastPath = document.getElementById("scan-last-path");
  const lastPurpose = document.getElementById("scan-last-purpose");
  const hint = document.getElementById("scan-hint");
  if (last) {
    lastEl.hidden = false;
    try { lastPath.textContent = new URL(last.url).pathname; }
    catch { lastPath.textContent = last.url || "—"; }
    lastPurpose.textContent = ` · ${last.purpose}`;
    hint.hidden = true;
  } else {
    lastEl.hidden = true;
    hint.hidden = false;
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

async function getScanProgress() {
  try {
    const { scanProgress } = await chrome.storage.session.get("scanProgress");
    return scanProgress || null;
  } catch {
    return null;
  }
}

async function getScanBuffer() {
  try {
    const { scanBuffer } = await chrome.storage.session.get("scanBuffer");
    return scanBuffer || null;
  } catch {
    return null;
  }
}

async function refresh() {
  const [allowlist, tab, state, scanProgress, scanBuffer] = await Promise.all([
    loadAllowlist(),
    getActiveTab(),
    getState(),
    getScanProgress(),
    getScanBuffer(),
  ]);
  const onGbf = tab && tab.url ? urlMatchesAllowlist(tab.url, allowlist) : false;

  // Explicit user gesture (popup opened) on a GBF tab wakes the machine.
  if (onGbf && state.state === STATES.DISABLED) {
    await dispatch({ type: EVENTS.WAKE_IF_GBF, onGbf: true, tabId: tab.id, tabTitle: tab.title });
    return refresh();
  }

  setStatusChrome({ state, onGbf });
  showActions(state, { onGbf, scanProgress, scanBuffer });
  showSessionBanner(state, tab?.id);
}

document.getElementById("actions").addEventListener("click", async (e) => {
  const btn = e.target.closest("button.action");
  if (!btn || btn.disabled) return;
  const tab = await getActiveTab();
  const next = await dispatch({ type: btn.dataset.event, tabId: tab?.id, tabTitle: tab?.title });
  if (next?.error) document.getElementById("action-notice").textContent = next.error;
  await refresh();
});

document.getElementById("stop-button").addEventListener("click", async () => {
  await dispatch({ type: EVENTS.STOP_SESSION });
  await refresh();
});

document.getElementById("commit-button").addEventListener("click", async () => {
  const notice = document.getElementById("action-notice");
  notice.textContent = "Saving…";
  const res = await send({ type: "COMMIT_INVENTORY" });
  notice.textContent = res?.ok
    ? `Inventory saved (${res.completeness?.overall || "Partial"}).`
    : "Save failed. Your previous inventory is unchanged. See DevTools console.";
  await refresh();
});

// React to state changes coming from the service worker (e.g. tab close),
// and to scan-progress ticks from the capture sink.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && (changes.state || changes.scanProgress || changes.scanBuffer)) refresh();
});

refresh().catch((err) => {
  document.getElementById("action-notice").textContent =
    `Popup init failed: ${err?.message || err}`;
});
