// DevTools capture adapter. Loaded once per DevTools window (one per inspected
// GBF tab). Uses chrome.devtools.network to observe requests that finish AFTER
// DevTools was opened (§38.3 known limitation).
//
// Attach only when a session is active on THIS inspected tab (AC2).
// Detach on any of: state leaves SessionActive, tab id no longer matches,
// STOP_CAPTURE message from background, or DevTools closing.

import { sanitizePayload } from "../lib/sanitize-payload.js";
import { assertPort } from "../lib/capture-port.js";

const SESSION_STATES = new Set([
  "AccountScanActive", "CalibrationSessionActive", "RaidSessionActive",
]);

const inspectedTabId = chrome.devtools.inspectedWindow.tabId;
const adapterId = `capture:devtools:${inspectedTabId}:${Date.now()}`;

let attached = false;
let allowlist = null;
let port = null;

// The Port shape this module exposes for identity + auditing. The chrome.*
// calls are wrapped inside attach/detach — nothing else escapes.
const adapter = {
  id: adapterId,
  attach: () => attach(),
  detach: () => detach(),
};
assertPort(adapter); // Fail fast on load if the module drifts from the Port.

async function loadAllowlist() {
  if (allowlist) return allowlist;
  const res = await fetch(chrome.runtime.getURL("src/data/endpoint-allowlist.json"));
  allowlist = await res.json();
  return allowlist;
}

async function attach() {
  if (attached) return;
  await loadAllowlist();
  port = chrome.runtime.connect({ name: adapterId });
  port.onMessage.addListener((msg) => {
    if (msg?.type === "STOP_CAPTURE") detach();
  });
  port.onDisconnect.addListener(() => { port = null; if (attached) detach(); });
  chrome.devtools.network.onRequestFinished.addListener(onRequestFinished);
  attached = true;
  console.log("[GBF Copilot] DevTools adapter attached:", adapterId);
}

async function detach() {
  if (!attached) return;
  attached = false;
  try { chrome.devtools.network.onRequestFinished.removeListener(onRequestFinished); }
  catch (err) { /* listener removal is idempotent */ }
  // In-memory buffers: we intentionally do not buffer. Each observation is
  // forwarded and released immediately. allowlist is inert reference data.
  if (port) {
    try { port.disconnect(); } catch {}
    port = null;
  }
  console.log("[GBF Copilot] DevTools adapter detached:", adapterId);
}

const FEASIBILITY_MAX_BODY = 8 * 1024; // 8 KiB preview cap in feasibility mode

async function isFeasibilityMode() {
  try {
    const { feasibilityMode } = await chrome.storage.local.get("feasibilityMode");
    return !!feasibilityMode;
  } catch { return false; }
}

function onRequestFinished(entry) {
  entry.getContent(async (body) => {
    try {
      const raw = {
        url: entry.request?.url,
        method: entry.request?.method,
        body: typeof body === "string" ? body : "",
        receivedAt: Date.now(),
      };
      const feasibility = await isFeasibilityMode();
      if (feasibility) {
        // Bypass endpoint filter so we can see EVERY GBF payload once during
        // §49 Q2/Q6. Still enforce credential + size cap.
        const preview = raw.body.length > FEASIBILITY_MAX_BODY
          ? raw.body.slice(0, FEASIBILITY_MAX_BODY) + "\n... (truncated)"
          : raw.body;
        if (port) port.postMessage({
          type: "PAYLOAD",
          adapterId,
          payload: { url: raw.url, method: raw.method, body: preview, purpose: "feasibility", receivedAt: raw.receivedAt },
          feasibility: true,
        });
        return;
      }
      const sanitized = sanitizePayload(raw, allowlist);
      if (!sanitized) return; // dropped by endpoint allowlist / size / validation
      if (port) port.postMessage({ type: "PAYLOAD", adapterId, payload: sanitized });
    } catch (err) {
      console.warn("[GBF Copilot] request handler failed:", err);
    }
  });
}

async function evaluateSessionAndSync() {
  const state = await new Promise((resolve) =>
    chrome.runtime.sendMessage({ type: "GET_STATE" }, resolve));
  const shouldAttach = state
    && SESSION_STATES.has(state.state)
    && state.tabId === inspectedTabId;
  if (shouldAttach && !attached) await attach();
  else if (!shouldAttach && attached) await detach();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.state) evaluateSessionAndSync();
});

evaluateSessionAndSync().catch((err) =>
  console.warn("[GBF Copilot] initial session sync failed:", err));
