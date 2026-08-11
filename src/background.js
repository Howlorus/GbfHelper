// Service worker: wires the pure state machine to chrome APIs.
// Persistence: chrome.storage.session — cleared on browser restart, so the
// machine always boots to Disabled (§43 "no session auto-resumes").

import { STATES, reduce, initialState, isSessionActive, sessionMeta, EVENTS } from "./lib/state-machine.js";
import { urlMatchesAllowlist } from "./lib/host-check.js";
import { CaptureRegistry } from "./lib/capture-registry.js";
import { acceptPayload, initialProgress } from "./lib/scan-progress.js";
import { parsePayload } from "./lib/parsers/index.js";
import "./lib/parsers/characters.js";
import "./lib/parsers/weapons.js";
import "./lib/parsers/summons.js";
import "./lib/parsers/teams.js";
import { buildInventoryFromBuffer } from "./lib/inventory-commit.js";

const BADGE_BG = "#e0a020";
const BADGE_FG = "#101010";

const STATE_KEY = "state";
const SCAN_PROGRESS_KEY = "scanProgress";
const SCAN_BUFFER_KEY = "scanBuffer";

function initialScanBuffer() {
  return { characters: [], weapons: [], summons: [], teams: [], parserStatus: {}, warnings: [] };
}

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
    // Scan progress + record buffer lifecycle: seed on entry, clear on exit.
    if (current.state !== STATES.ACCOUNT_SCAN_ACTIVE && next.state === STATES.ACCOUNT_SCAN_ACTIVE) {
      await chrome.storage.session.set({
        [SCAN_PROGRESS_KEY]: initialProgress(),
        [SCAN_BUFFER_KEY]: initialScanBuffer(),
      });
    } else if (current.state === STATES.ACCOUNT_SCAN_ACTIVE && next.state !== STATES.ACCOUNT_SCAN_ACTIVE) {
      await chrome.storage.session.remove([SCAN_PROGRESS_KEY, SCAN_BUFFER_KEY]);
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
      console.log("[GBF Copilot] observed:",
        msg.payload.method, msg.payload.url, `(${msg.payload.purpose})`);
      // Domain sink: accumulate scan progress only when a scan is active (AC4).
      onCapturePayload(msg.payload).catch((err) =>
        console.warn("[GBF Copilot] scan sink failed:", err));
    }
  });
});

async function commitInventory() {
  const state = await getState();
  if (state.state !== STATES.ACCOUNT_SCAN_ACTIVE) {
    return { ok: false, error: "no active scan session" };
  }
  const { [SCAN_BUFFER_KEY]: buffer } = await chrome.storage.session.get(SCAN_BUFFER_KEY);
  const inventory = buildInventoryFromBuffer(buffer, {
    schemaVersion: 1,
    extensionVersion: chrome.runtime.getManifest().version,
    committedAt: Date.now(),
  });
  // Snapshot the previous inventory for a one-step rollback (§43 reliability).
  const prev = await chrome.storage.local.get("inventory");
  if (prev.inventory) await chrome.storage.local.set({ inventoryPrev: prev.inventory });
  await chrome.storage.local.set({ inventory });
  await dispatch({ type: EVENTS.STOP_SESSION });
  return { ok: true, completeness: inventory.completeness, committedAt: inventory.committedAt };
}

async function onCapturePayload(payload) {
  const state = await getState();
  if (state.state !== STATES.ACCOUNT_SCAN_ACTIVE) return; // AC4

  const store = await chrome.storage.session.get([SCAN_PROGRESS_KEY, SCAN_BUFFER_KEY]);
  const nextProgress = acceptPayload(store[SCAN_PROGRESS_KEY], payload);

  // Parse into records and append to the appropriate purpose bucket.
  const buffer = store[SCAN_BUFFER_KEY] || initialScanBuffer();
  const { records, warnings, status } = parsePayload(payload.purpose, payload.body);
  if (buffer[payload.purpose]) {
    buffer[payload.purpose] = buffer[payload.purpose].concat(records);
  }
  buffer.parserStatus = { ...buffer.parserStatus, [payload.purpose]: status };
  if (warnings.length) buffer.warnings = buffer.warnings.concat(warnings.map((w) => `${payload.purpose}: ${w}`));

  await chrome.storage.session.set({
    [SCAN_PROGRESS_KEY]: nextProgress,
    [SCAN_BUFFER_KEY]: buffer,
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "GET_STATE") {
        sendResponse(await getState());
      } else if (msg?.type === "DISPATCH" && msg.action) {
        sendResponse(await dispatch(msg.action));
      } else if (msg?.type === "COMMIT_INVENTORY") {
        sendResponse(await commitInventory());
      } else if (msg?.type === "GET_INVENTORY") {
        const { inventory } = await chrome.storage.local.get("inventory");
        sendResponse(inventory || null);
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
