import { urlMatchesAllowlist } from "../lib/host-check.js";

const versionEl = document.getElementById("version");
if (versionEl) versionEl.textContent = "v" + chrome.runtime.getManifest().version;

const openOptions = document.getElementById("open-options");
if (openOptions) {
  openOptions.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

async function loadAllowlist() {
  const url = chrome.runtime.getURL("src/data/host-allowlist.json");
  const res = await fetch(url);
  return res.json();
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function getActiveSession() {
  // US-01-03 will set / clear this; US-01-02 only reads it.
  try {
    const { activeSession } = await chrome.storage.session.get("activeSession");
    return activeSession || null;
  } catch {
    return null;
  }
}

function setStatus({ onGbf, tab }) {
  const label = document.getElementById("status-label");
  const hint = document.getElementById("status-hint");
  document.body.dataset.gbf = onGbf ? "on" : "off";
  if (onGbf) {
    label.textContent = "Ready";
    hint.textContent = "Choose an action. Nothing runs until you start it.";
  } else if (!tab || !tab.url) {
    label.textContent = "Dormant";
    hint.textContent = "Open a Granblue Fantasy tab to enable session actions.";
  } else {
    label.textContent = "Dormant";
    hint.textContent = "This tab is not a Granblue Fantasy page.";
  }
}

function setActionsEnabled(enabled) {
  for (const btn of document.querySelectorAll(".action")) {
    btn.disabled = !enabled;
  }
}

function wireActionClicks() {
  const notice = document.getElementById("action-notice");
  for (const btn of document.querySelectorAll(".action")) {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const us = btn.dataset.us || "a later US";
      const label = btn.querySelector(".action-label")?.textContent || "This action";
      notice.textContent = `${label}: implementation lands in ${us}.`;
    });
  }
}

function showSessionBanner(session, activeTabId) {
  const banner = document.getElementById("session-banner");
  const titleEl = document.getElementById("session-tab-title");
  if (!session || !session.tabId || session.tabId === activeTabId) {
    banner.hidden = true;
    return;
  }
  titleEl.textContent = session.tabTitle || `tab ${session.tabId}`;
  banner.hidden = false;
}

async function refresh() {
  const [allowlist, tab, session] = await Promise.all([
    loadAllowlist(),
    getActiveTab(),
    getActiveSession(),
  ]);
  const onGbf = tab && tab.url ? urlMatchesAllowlist(tab.url, allowlist) : false;
  setStatus({ onGbf, tab });
  setActionsEnabled(onGbf);
  showSessionBanner(session, tab?.id);
}

wireActionClicks();
refresh().catch((err) => {
  document.getElementById("action-notice").textContent =
    `Popup init failed: ${err?.message || err}`;
});
