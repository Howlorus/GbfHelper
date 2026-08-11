// Service worker: wires the pure state machine to chrome APIs.
// Persistence: chrome.storage.session — cleared on browser restart, so the
// machine always boots to Disabled (§43 "no session auto-resumes").

import { reduce, initialState, isSessionActive, sessionMeta, EVENTS } from "./lib/state-machine.js";
import { urlMatchesAllowlist } from "./lib/host-check.js";
import { CaptureRegistry } from "./lib/capture-registry.js";

const BADGE_BG = "#e0a020";
const BADGE_FG = "#101010";

const STATE_KEY = "state";

// One registry per service-worker lifetime. When the SW dies, in-memory
// adapters die with it (there is no live buffer to leak). When a session
// ends via any path, detachAll is invoked before dispatch returns.
export const captureRegistry = new CaptureRegistry();

let allowlistPromise = null;
function loadAllowlist() {
  if (!allowlistPromise) {
    allowlistPromise = fetch(chrome.runtime.getURL("src/data/host-allowlist.json"))
      .then((r) => r.json())
      .catch((err) => { allowlistPromise = null; throw err; });
  }
  return allowlistPromise;
}

async function getState() {
  const { [STATE_KEY]: s } = await chrome.storage.session.get(STATE_KEY);
  return s || initialState();
}

async function setState(next) {
  await chrome.storage.session.set({ [STATE_KEY]: next });
}

async function dispatch(action) {
  const current = await getState();
  const next = reduce(current, action);
  if (next === current) return current;
  await setState(next);
  if (next.state !== current.state) {
    console.log("[GBF Copilot] state:", current.state, "->", next.state, "on", action.type);
    if (isSessionActive(current) && !isSessionActive(next)) {
      const { durationMs, results } = await captureRegistry.detachAll();
      const failures = results.filter((r) => !r.ok).length;
      console.log(`[GBF Copilot] detached ${results.length} adapter(s) in ${durationMs}ms (${failures} failed)`);
    }
    await updateBadge(next);
  }
  return next;
}

async function updateBadge(state) {
  const meta = sessionMeta(state);
  if (!meta) {
    await chrome.action.setBadgeText({ text: "" });
    await chrome.action.setTitle({ title: "GBF Copilot" });
    return;
  }
  await chrome.action.setBadgeText({ text: meta.badge });
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_BG });
  if (chrome.action.setBadgeTextColor) {
    await chrome.action.setBadgeTextColor({ color: BADGE_FG });
  }
  const on = state.tabTitle ? ` on ${state.tabTitle}` : "";
  await chrome.action.setTitle({ title: `GBF Copilot — ${meta.kind}${on}` });
}

// Sync badge with persisted state on every service-worker cold start.
getState().then(updateBadge).catch((err) =>
  console.warn("[GBF Copilot] initial badge sync failed:", err));

// Extension update / reload / install: never carry a session across the boundary.
chrome.runtime.onInstalled.addListener(async () => {
  await captureRegistry.detachAll();
  await chrome.storage.session.remove(STATE_KEY);
  await updateBadge(initialState());
});

// Browser cold start: storage.session is already empty, but be explicit.
chrome.runtime.onStartup.addListener(async () => {
  await chrome.storage.session.remove(STATE_KEY);
  await updateBadge(initialState());
});

// Best-effort teardown when Chrome decides to unload the SW.
if (chrome.runtime.onSuspend) {
  chrome.runtime.onSuspend.addListener(() => {
    // fire-and-forget: onSuspend gives us no time for awaits.
    captureRegistry.detachAll().catch(() => {});
  });
}

// Capture adapters (currently: DevTools page) connect via chrome.runtime.connect
// with a port name prefixed "capture:". Each connected port becomes an entry
// in the CaptureRegistry — detachAll broadcasts STOP_CAPTURE.
chrome.runtime.onConnect.addListener((port) => {
  if (!port?.name?.startsWith("capture:")) return;
  const adapterId = port.name;
  try {
    captureRegistry.register(adapterId, () => new Promise((resolve) => {
      try { port.postMessage({ type: "STOP_CAPTURE" }); } catch {}
      try { port.disconnect(); } catch {}
      resolve();
    }));
    console.log(`[GBF Copilot] capture adapter connected: ${adapterId}`);
  } catch (err) {
    console.warn(`[GBF Copilot] adapter register failed:`, err);
    try { port.disconnect(); } catch {}
    return;
  }
  port.onDisconnect.addListener(() => {
    if (captureRegistry.has(adapterId)) {
      captureRegistry.unregister(adapterId);
      console.log(`[GBF Copilot] capture adapter disconnected: ${adapterId}`);
    }
  });
  port.onMessage.addListener((msg) => {
    if (msg?.type === "PAYLOAD" && msg.payload) {
      // Sink: for now, log. Domain consumers (E02, E09) subscribe later.
      console.log("[GBF Copilot] observed:",
        msg.payload.method, msg.payload.url, `(${msg.payload.purpose})`);
    }
  });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "GET_STATE") {
        sendResponse(await getState());
      } else if (msg?.type === "DISPATCH" && msg.action) {
        sendResponse(await dispatch(msg.action));
      } else {
        sendResponse({ error: "unknown message" });
      }
    } catch (err) {
      sendResponse({ error: String(err?.message || err) });
    }
  })();
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const s = await getState();
  if (isSessionActive(s) && s.tabId === tabId) {
    await dispatch({ type: EVENTS.TAB_CLOSED, tabId });
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return;
  const s = await getState();
  if (!isSessionActive(s) || s.tabId !== tabId) return;
  try {
    const allowlist = await loadAllowlist();
    const stillGbf = urlMatchesAllowlist(changeInfo.url, allowlist);
    if (!stillGbf) {
      await dispatch({ type: EVENTS.TAB_NAVIGATED_AWAY, tabId });
    }
  } catch (err) {
    console.warn("[GBF Copilot] allowlist load failed on nav:", err);
    await dispatch({ type: EVENTS.TAB_NAVIGATED_AWAY, tabId });
  }
});
